import { Injectable } from '@nestjs/common';
import BtcRpc, { ListTransactionsResult } from 'bitcoin-core';
import bunyan from 'bunyan';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import { EntityManager, getManager } from 'typeorm';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { Coin } from '../entities/coin.entity';
import { WithdrawalStatus } from '../entities/withdrawal-status.enum';
import { Withdrawal } from '../entities/withdrawal.entity';

const { BTC } = CoinEnum;
const { bitcoin } = ChainEnum;

@Injectable()
export class BtcUpdateWithdrawal extends NestSchedule {
  private readonly logger: bunyan;
  private readonly rpc: BtcRpc;
  private readonly amqpService: AmqpService;
  private readonly confThreshold: number;
  private readonly step: number;

  constructor(
    config: ConfigService,
    logger: bunyan,
    amqpService: AmqpService,
    rpc: BtcRpc,
  ) {
    super();
    this.logger = logger;
    this.amqpService = amqpService;
    this.rpc = rpc;
    this.confThreshold = config.get('bitcoin.btc.confThreshold');
    this.step = config.get('bitcoin.btc.withdrawalStep');
  }

  @Cron('*/10 * * * *', { startTime: new Date() })
  public async cron(): Promise<void> {
    await getManager().transaction(async (manager) => {
      const coin = await manager
        .createQueryBuilder(Coin, 'c')
        .where({ symbol: BTC })
        .setLock('pessimistic_write')
        .getOne();
      if (!coin) {
        throw new Error();
      }
      const task = await this.taskSelector(manager, coin);
      if (task) {
        await task();
      }
    });
  }

  private async taskSelector(
    manager: EntityManager,
    coin: Coin,
  ): Promise<(() => Promise<void>) | null> {
    // find unhandled withdrawal with minimal id
    const w = await manager
      .createQueryBuilder(Withdrawal, 'w')
      .where({
        status: WithdrawalStatus.created,
        symbol: BTC,
      })
      .orderBy('id', 'ASC')
      .getOne();
    if (!w) {
      return null;
    }
    while (true) {
      const txs = await this.rpc.listTransactions(
        'braavos',
        64,
        coin.info.withdrawalCursor,
      );
      if (txs.length === 0) {
        return this.broadcast(manager);
      }
      for (const tx of txs.filter((t) => t.category === 'send')) {
        // assure the comment being number and positive
        if (!(Number(tx.comment) > 0)) {
          throw new Error();
        }
        if (Number(tx.comment) >= w.id) {
          return this.credit(manager, coin, tx);
        }
      }
      coin.info.withdrawalCursor += txs.length;
    }
  }

  private async broadcast(
    manager: EntityManager,
  ): Promise<() => Promise<void>> {
    return async () => {
      const ws = await manager
        .createQueryBuilder(Withdrawal, 'w')
        .where({
          coinSymbol: BTC,
          status: WithdrawalStatus.created,
        })
        .orderBy('id', 'ASC')
        .limit(this.step)
        .getMany();
      await this.rpc.sendMany(
        'braavos',
        ws.reduce((acc: { [_: string]: string }, cur) => {
          acc[cur.recipient] = cur.amount;
          return acc;
        }, {}),
        this.confThreshold,
        String(ws.slice(-1)[0].id),
      );
    };
  }

  private async credit(
    manager: EntityManager,
    coin: Coin,
    tx: ListTransactionsResult,
  ): Promise<() => Promise<void>> {
    return async () => {
      const ws = await manager
        .createQueryBuilder(Withdrawal, 'w')
        .where(`coinSymbol = 'BTC' AND status = 'created' AND id <= :key`, {
          key: Number(tx.comment),
        })
        .setLock('pessimistic_write')
        .getMany();
      const txs = await this.rpc.listTransactions(
        'braavos',
        64,
        coin.info.withdrawalCursor,
      );
      // TODO update status, credit fee
      this.logger.warn(ws);
      this.logger.warn(txs);
    };
  }
}

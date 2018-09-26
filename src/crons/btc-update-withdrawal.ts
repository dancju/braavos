import { Injectable } from '@nestjs/common';
import BtcRpc, { ListTransactionsResult } from 'bitcoin-core';
import bunyan from 'bunyan';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigParam } from 'nestjs-config';
import { EntityManager, Transaction, TransactionManager } from 'typeorm';
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

  constructor(logger: bunyan, rpc: BtcRpc, amqpService: AmqpService) {
    super();
    this.logger = logger;
    this.rpc = rpc;
    this.amqpService = amqpService;
  }

  @Cron('*/10 * * * *', { startTime: new Date() })
  @Transaction()
  public async cron(
    @ConfigParam('bitcoin.btc.confThreshold') confThreshold: number,
    @ConfigParam('bitcoin.btc.withdrawalStep') step: number,
    @TransactionManager() manager: EntityManager,
  ): Promise<void> {
    const coin = await manager
      .createQueryBuilder(Coin, 'c')
      .where({ symbol: BTC })
      .setLock('pessimistic_write')
      .getOne();
    if (!coin) {
      throw new Error();
    }
    const broadcast = async () => {
      const ws = await manager
        .createQueryBuilder(Withdrawal, 'w')
        .where({
          coinSymbol: BTC,
          status: WithdrawalStatus.created,
        })
        .orderBy('id', 'ASC')
        .limit(step)
        .getMany();
      await this.rpc.sendMany(
        'braavos',
        ws.reduce((acc: { [_: string]: string }, cur) => {
          acc[cur.recipient] = cur.amount;
          return acc;
        }, {}),
        confThreshold,
        String(ws.slice(-1)[0].id),
      );
    };
    const credit = async (tx: ListTransactionsResult) => {
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
    };
    const taskSelector = async (): Promise<(() => Promise<void>) | null> => {
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
          return broadcast;
        }
        for (const tx of txs.filter((t) => t.category === 'send')) {
          // assure the comment being number and positive
          if (!(Number(tx.comment) > 0)) {
            throw new Error();
          }
          if (Number(tx.comment) >= w.id) {
            return credit(tx);
          }
        }
        coin.info.withdrawalCursor += txs.length;
      }
    };
    const task = await taskSelector();
    if (task) {
      await task();
    }
  }
}

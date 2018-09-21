import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigParam, Configurable } from 'nestjs-config';
import { getManager } from 'typeorm';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';

const { BTC } = CoinEnum;
const { bitcoin } = ChainEnum;

@Injectable()
export class BtcUpdateDeposit extends NestSchedule {
  private readonly rpc: BtcRpc;
  private readonly amqpService: AmqpService;

  constructor(rpc: BtcRpc, amqpService: AmqpService) {
    super();
    this.rpc = rpc;
    this.amqpService = amqpService;
  }

  @Configurable()
  @Cron('*/10 * * * *', { startTime: new Date() })
  public async cron(
    @ConfigParam('bitcoin.btc.confThreshold') confThreshold: number,
  ): Promise<void> {
    const deposits: Deposit[] = [];
    getManager().transaction(async (manager) => {
      for (const d of await manager
        .createQueryBuilder()
        .select()
        .from(Deposit, 'deposit')
        .where({ coinSymbol: BTC, status: DepositStatus.unconfirmed })
        .setLock('pessimistic_write')
        .getMany()) {
        if (!d.txHash) {
          throw new Error();
        }
        if (
          (await this.rpc.getTransaction(d.txHash)).confirmations <
          confThreshold
        ) {
          continue;
        }
        await Promise.all([
          manager
            .createQueryBuilder()
            .update(Deposit)
            .set({ status: DepositStatus.confirmed })
            .where({ id: d.id })
            .execute(),
          manager
            .createQueryBuilder()
            .insert()
            .into(Account)
            .values({ clientId: d.clientId, coinSymbol: BTC })
            .onConflict('("clientId", "coinSymbol") DO NOTHING')
            .execute(),
          manager.increment(
            Account,
            { clientId: d.clientId, coinSymbol: BTC },
            'balance',
            Number(d.amount),
          ),
        ]);
        // TODO check if reload is necessary
        await d.reload();
        deposits.push(d);
      }
    });
    deposits.forEach(this.amqpService.updateDeposit);
  }
}

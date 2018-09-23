import { Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import { getManager } from 'typeorm';
import { AmqpService } from '../amqp/amqp.service';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';

const { BTC } = CoinEnum;

@Injectable()
export class BtcUpdateDeposit extends NestSchedule {
  private readonly rpc: BtcRpc;
  private readonly amqpService: AmqpService;
  private readonly confThreshold: number;

  constructor(rpc: BtcRpc, amqpService: AmqpService, config: ConfigService) {
    super();
    this.rpc = rpc;
    this.amqpService = amqpService;
    this.confThreshold = config.get('bitcoin.btc.confThreshold');
    if (typeof this.confThreshold !== 'number') {
      throw new Error();
    }
  }

  @Cron('*/10 * * * *', { startTime: new Date() })
  public async cron(): Promise<void> {
    const deposits: Deposit[] = [];
    getManager().transaction(async (manager) => {
      console.log('------------------');
      for (const d of await manager
        .createQueryBuilder()
        .select()
        .from(Deposit, 'deposit')
        .where({ coinSymbol: BTC, status: DepositStatus.unconfirmed })
        .setLock('pessimistic_write')
        .getMany()) {
        console.log(d);
        if (!d.txHash) {
          throw new Error();
        }
        console.log(await this.rpc.getTransaction(d.txHash));
        if (
          (await this.rpc.getTransaction(d.txHash)).confirmations <
          this.confThreshold
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

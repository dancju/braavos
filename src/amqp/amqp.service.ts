import { Inject, Injectable } from '@nestjs/common';
import { Connection } from 'amqplib';
import { InjectAmqpConnection } from 'nestjs-amqp';
import { ConfigParam, ConfigService, Configurable } from 'nestjs-config';
import {
  EntityManager,
  getManager,
  Transaction,
  TransactionManager,
} from 'typeorm';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';
import { WithdrawalStatus } from '../entities/withdrawal-status.enum';
import { Withdrawal } from '../entities/withdrawal.entity';

@Injectable()
export class AmqpService {
  private readonly connection: Connection;
  private readonly coinServices: { [_ in CoinEnum]?: ICoinService };

  constructor(
    @InjectAmqpConnection() connection: Connection,
    @Inject('CoinServiceRepo') coinServices: { [_ in CoinEnum]?: ICoinService },
  ) {
    this.connection = connection;
    this.coinServices = coinServices;
    this.createWithdrawal();
  }

  public async updateWithdrawal(withdrawal: Withdrawal): Promise<void> {
    await this.publish('withdrawal_update', withdrawal);
  }

  public async createDeposit(deposit: Deposit): Promise<void> {
    await this.publish('deposit_creation', deposit);
  }

  public async updateDeposit(deposit: Deposit): Promise<void> {
    await this.publish('deposit_updation', deposit);
  }

  private async publish(queue: string, message: any): Promise<void> {
    const channel = await this.connection.createChannel();
    await channel.assertQueue(queue);
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  }

  private async createWithdrawal() {
    const channel = await this.connection.createChannel();
    const queue = 'withdrawal_creation';
    channel.assertQueue(queue);
    channel.consume(queue, async (msg) => {
      if (!msg) {
        return;
      }
      const body = JSON.parse(msg.content.toString());
      const clientId = 1;
      if (
        await Withdrawal.findOne({
          clientId,
          key: body.key,
        })
      ) {
        channel.ack(msg);
        return;
      }
      const coinService = this.coinServices[body.coinSymbol];
      if (!coinService) {
        channel.ack(msg);
        return;
      }
      if (!coinService.isValidAddress(body.recipient)) {
        channel.ack(msg);
        return;
      }
      await Account.createQueryBuilder()
        .insert()
        .values({ clientId, coinSymbol: body.coinSymbol })
        .onConflict('("clientId", "coinSymbol") DO NOTHING')
        .execute();
      await getManager().transaction(async (manager) => {
        const account = await manager
          .createQueryBuilder(Account, 'account')
          .where({ clientId, coinSymbol: body.coinSymbol })
          .setLock('pessimistic_write')
          .getOne();
        if (!account) {
          channel.ack(msg);
          return;
        }
        await manager.decrement(
          Account,
          { clientId, coinSymbol: body.coinSymbol },
          'balance',
          Number(body.amount),
        );
        await manager
          .createQueryBuilder()
          .insert()
          .into(Withdrawal)
          .values({
            amount: body.amount,
            clientId,
            coinSymbol: body.coinSymbol,
            key: body.key,
            memo: body.memo,
            recipient: body.recipient,
          })
          .execute();
      });
      channel.ack(msg);
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  HttpException,
} from '@nestjs/common';
import { Channel, Connection } from 'amqplib';
import { getManager } from 'typeorm';
import { Account } from '../entities/account.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';

@Injectable()
export class AmqpService {
  private readonly channel;
  private coinAgents: { [k in CoinSymbol]?: CoinAgent };

  constructor(
    @Inject('amqp-connection') connection: Connection,
    @Inject('coin-agent-repo') coinAgents: { [k in CoinSymbol]?: CoinAgent },
  ) {
    this.coinAgents = coinAgents;
    this.channel = connection.createChannel();
    this.channel.then((channel: Channel) => {
      Promise.all([
        channel.assertQueue('deposit_creation'),
        channel.assertQueue('deposit_update'),
        channel.assertQueue('withdrawal_creation'),
        channel.assertQueue('withdrawal_update'),
      ]).then(() => {
        // TODO logger.debug('all queues are ready.')
        return channel.consume('withdrawal_create', async (msg) => {
          if (msg !== null) {
            console.log('======================');
            const body = JSON.parse(msg.content.toString());
            // TODO handle amqp auth
            // TODO handle body validation
            const clientId = 0;
            if (
              await Withdrawal.findOne({
                clientId,
                key: body.key,
              })
            ) {
              throw new ConflictException();
            }
            const agent = this.coinAgents[body.coinSymbol];
            if (!agent) {
              throw new Error();
            }
            if (!agent.isValidAddress(body.recipient)) {
              throw new BadRequestException('Bad Recipient');
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
                throw new Error();
              }
              if (Number(account.balance) < Number(body.amount)) {
                throw new HttpException('Payment Required', 402);
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
            const res = (await Withdrawal.findOne({
              clientId,
              key: body.key,
            }))!;
            await agent.createWithdrawal(res);
            channel.ack(msg);
          }
        });
      });
    });
  }

  public async updateWithdrawal(withdrawal: Withdrawal): Promise<void> {
    const channel = await this.channel;
    const queue = 'withdrawal_update';
    await channel.assertQueue(queue);
    // TODO
    channel.sendToQueue(queue, Buffer.from('something to do'));
  }

  public async createDeposit(deposit: Deposit): Promise<void> {
    const channel = await this.channel;
    const queue = 'deposit_creation';
    await channel.assertQueue(queue);
    // TODO
  }

  public async updateDeposite(deposit: Deposit): Promise<void> {
    const channel = await this.channel;
    const queue = 'deposit_updation';
    await channel.assertQueue(queue);
    // TODO
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Channel, Connection } from 'amqplib';
import { Deposit } from 'entities/deposit.entity';
import { Withdrawal } from 'entities/withdrawal.entity';

@Injectable()
export class AmqpService {
  private readonly channel;

  constructor(@Inject('amqp-connection') connection: Connection) {
    this.channel = connection.createChannel();
    this.channel.then((channel: Channel) => {
      Promise.all([
        channel.assertQueue('deposit_create'),
        channel.assertQueue('deposit_update'),
        channel.assertQueue('withdrawal_create'),
        channel.assertQueue('withdrawal_update'),
      ]).then(() => {
        // TODO logger.debug('all queues are ready.')
        return channel.consume('withdrawal_create', (msg) => {
          if (msg !== null) {
            // TODO consume withdrawal_create
            // console.log(msg.content.toString());
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
    const queue = 'deposit_create';
    await channel.assertQueue(queue);
    // TODO
  }

  public async updateDeposite(deposit: Deposit): Promise<void> {
    const channel = await this.channel;
    const queue = 'deposit_update';
    await channel.assertQueue(queue);
    // TODO
  }
}

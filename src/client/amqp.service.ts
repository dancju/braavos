import { Injectable } from '@nestjs/common';
import { Connection } from 'amqplib';
import { InjectAmqpConnection } from 'nestjs-amqp';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';

@Injectable()
export class AmqpService {
  public readonly connection: Connection;

  constructor(@InjectAmqpConnection() connection: Connection) {
    this.connection = connection;
  }

  public async updateWithdrawal(withdrawal: Withdrawal): Promise<void> {
    await this.publish('withdrawal_update', withdrawal);
  }

  public async createDeposit(deposit: Deposit): Promise<void> {
    await this.publish('deposit_creation', deposit);
  }

  public async updateDeposite(deposit: Deposit): Promise<void> {
    await this.publish('deposit_updation', deposit);
  }

  private async publish(queue: string, message: any) {
    const channel = await this.connection.createChannel();
    await channel.assertQueue(queue);
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  }
}

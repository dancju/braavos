import { NestSchedule } from 'nest-schedule';
import { AmqpService } from '../client/amqp.service';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';

export abstract class CoinAgent extends NestSchedule {
  protected abstract coin: Promise<Coin>;
  private readonly amqpService: AmqpService;

  constructor(amqpService: AmqpService) {
    super();
    this.amqpService = amqpService;
  }

  public abstract getAddr(clientId: number, path: string): Promise<string>;
  public abstract isValidAddress(addr: string): boolean;
  public abstract createWithdrawal(withdrawal: Withdrawal): Promise<void>;
  protected abstract getPrivateKey(derivePath: string): string;

  protected async pushDeposit(deposit: Deposit): Promise<void> {}
  protected async pushWithdrawal(withdrawal: Withdrawal): Promise<void> {}
}

import { NestSchedule } from 'nest-schedule';
import { Coin } from '../entities/coin.entity';
import { Withdrawal } from '../entities/withdrawal.entity';

export abstract class CoinAgent extends NestSchedule {
  protected abstract coin: Promise<Coin>;

  public abstract getAddr(clientId: number, path: string): Promise<string>;
  public abstract isValidAddress(addr: string): boolean;
  public abstract createWithdrawal(withdrawal: Withdrawal): Promise<void>;
  protected abstract getPrivateKey(derivePath: string): string;
}

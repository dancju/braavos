import { Injectable } from '@nestjs/common';
import { NestSchedule } from 'nest-schedule';
import { Withdrawal } from './withdrawal.entity';

@Injectable()
export abstract class CoinAgent extends NestSchedule {
  public abstract getPrivateKey(clientId: number, accountPath: string): string;
  public abstract getAddr(clientId: number, accountPath: string): string;
  public abstract isValidAddress(addr: string): boolean;
  public abstract createWithdrawal(withdrawal: Withdrawal);
}

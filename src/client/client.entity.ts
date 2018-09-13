import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Deposit } from '../utils/deposit.entity';
import { Withdrawal } from '../utils/withdrawal.entity';

@Entity()
export class Client extends BaseEntity {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public name: string;

  @Column()
  public secret: string;

  @Column()
  public ip: string;

  @OneToMany((type) => Deposit, (deposit) => deposit.client)
  public deposits: Promise<Deposit[]>;

  @OneToMany((type) => Withdrawal, (withdrawal) => withdrawal.client)
  public withdrawals: Promise<Deposit[]>;
}

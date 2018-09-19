import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { Client } from './client.entity';

@Entity()
export class Account extends BaseEntity {
  @PrimaryColumn({ enum: CoinSymbol, type: 'enum' })
  public coinSymbol!: CoinSymbol;

  @PrimaryColumn()
  public clientId!: number;

  @Column({ default: 0, precision: 24, scale: 8, type: 'decimal' })
  public balance!: string;

  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @UpdateDateColumn()
  public updatedAt!: Date;

  @ManyToOne(() => Client)
  public client!: Client;
}

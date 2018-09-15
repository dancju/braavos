import { ApiModelProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';
import { Client } from './client.entity';

@Entity()
export class Deposit extends BaseEntity {
  @ApiModelProperty()
  @PrimaryGeneratedColumn()
  public id: number;

  @ApiModelProperty()
  @Column({ enum: CoinSymbol, type: 'enum' })
  public coinSymbol: CoinSymbol;

  @Exclude()
  @Column()
  public clientId: number;

  @ApiModelProperty()
  @Column()
  public addrPath: string;

  @ApiModelProperty()
  @Column({ precision: 16, scale: 8, type: 'decimal' })
  public amount: string;

  @ApiModelProperty()
  @Column()
  public feeAmount: number;

  @ApiModelProperty()
  @Column({ type: 'enum', enum: CoinSymbol })
  public feeSymbol: CoinSymbol;

  @ApiModelProperty()
  @Column({
    default: DepositStatus.unconfirmed,
    enum: DepositStatus,
    type: 'enum',
  })
  public status: DepositStatus;

  @ApiModelProperty()
  @Column({ nullable: true })
  public txHash: string;

  @Exclude()
  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @ApiModelProperty()
  @CreateDateColumn()
  public createdAt: Date;

  @ManyToOne(() => Client)
  public client: Promise<Client>;
}

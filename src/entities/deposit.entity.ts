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
  @Exclude()
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
  public accountPath: string;

  @ApiModelProperty()
  @Column({ precision: 16, scale: 8, type: 'decimal' })
  public amount: string;

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

  @ManyToOne((type) => Client)
  public client: Promise<Client>;
}

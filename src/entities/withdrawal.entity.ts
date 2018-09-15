import { ApiModelProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { WithdrawalStatus } from '../utils/withdrawal-status.enum';
import { Client } from './client.entity';

@Entity()
@Index(['clientId', 'key'], { unique: true })
export class Withdrawal extends BaseEntity {
  @Exclude()
  @PrimaryGeneratedColumn()
  public id: number;

  @Exclude()
  @Column()
  public clientId: number;

  @ApiModelProperty()
  @Column()
  public key: string;

  @ApiModelProperty()
  @Column({ type: 'enum', enum: CoinSymbol })
  public coinSymbol: CoinSymbol;

  @ApiModelProperty()
  @Column()
  public recipient: string;

  @ApiModelProperty()
  @Column()
  public memo: string;

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
    default: WithdrawalStatus.created,
    enum: WithdrawalStatus,
    type: 'enum',
  })
  public status: WithdrawalStatus;

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

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
import { Client } from '../client/client.entity';
import { CryptoSymbol } from './crypto-symbol.enum';
import { WithdrawalStatus } from './withdrawal-status.enum';

@Entity()
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
  @Column({ type: 'enum', enum: CryptoSymbol })
  public cryptoSymbol: CryptoSymbol;

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

  @ManyToOne((type) => Client, (client) => client.withdrawals)
  public client: Promise<Client>;
}

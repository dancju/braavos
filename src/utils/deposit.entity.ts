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
import { DepositStatus } from './deposit-status.enum';

@Entity()
export class Deposit extends BaseEntity {
  @Exclude()
  @PrimaryGeneratedColumn()
  public id: number;

  @ApiModelProperty()
  @Column({ enum: CryptoSymbol, type: 'enum' })
  public cryptoSymbol: CryptoSymbol;

  @Exclude()
  @Column()
  public clientId: number;

  @ApiModelProperty()
  @Column()
  public accountId: number;

  @ApiModelProperty()
  @Column({ precision: 16, scale: 8, type: 'decimal' })
  public amount: string;

  @ApiModelProperty()
  @Column({ enum: DepositStatus, type: 'enum' })
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

  @ManyToOne((type) => Client, (client) => client.deposits)
  public client: Promise<Client>;
}

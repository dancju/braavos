import { ApiModelProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';
import { Client } from './client.entity';
import { Withdrawal } from './withdrawal.entity';

@Entity()
export class Deposit extends BaseEntity {
  @ApiModelProperty({ description: '标识符，可供客户端用作幂等键' })
  @PrimaryGeneratedColumn()
  public id!: number;

  @ApiModelProperty({ description: '数字货币符号' })
  @Column({ enum: CoinSymbol, type: 'enum' })
  public coinSymbol!: CoinSymbol;

  @Exclude()
  @Column()
  public clientId!: number;

  @ApiModelProperty({ description: '地址路径' })
  @Column()
  public addrPath!: string;

  @ApiModelProperty({ description: '充币数量' })
  @Column({ precision: 16, scale: 8, type: 'decimal' })
  public amount!: string;

  @ApiModelProperty({ description: '手续费数量' })
  @Column()
  public feeAmount!: number;

  @ApiModelProperty({ description: '手续费单位符号' })
  @Column({ type: 'enum', enum: CoinSymbol })
  public feeSymbol!: CoinSymbol;

  @ApiModelProperty({ description: '状态' })
  @Column({
    default: DepositStatus.unconfirmed,
    enum: DepositStatus,
    type: 'enum',
  })
  public status!: DepositStatus;

  @ApiModelProperty({ description: '转账 hash，仅针对链上转账有效' })
  @Column({ nullable: true })
  public txHash?: string;

  @Exclude()
  @JoinColumn()
  @OneToOne(() => Withdrawal, (w) => w.deposit, { nullable: true })
  public withdrawal?: Withdrawal;

  @Exclude()
  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @ApiModelProperty()
  @CreateDateColumn()
  public createdAt!: Date;

  @ManyToOne(() => Client)
  public client!: Promise<Client>;
}

import { ApiModelProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Chain } from '../utils/chain.enum';
import { CoinSymbol } from '../utils/coin-symbol.enum';

@Entity()
export class Coin extends BaseEntity {
  @ApiModelProperty({ description: '数字货币符号' })
  @PrimaryColumn({ enum: CoinSymbol, type: 'enum' })
  public symbol: CoinSymbol;

  @Exclude()
  @Column()
  public chain: Chain;

  @ApiModelProperty({ description: '充币手续费数量' })
  @Column()
  public depositFeeAmount: number;

  @ApiModelProperty({ description: '充币手续费单位符号' })
  @Column({ enum: CoinSymbol, type: 'enum' })
  public depositFeeSymbol: CoinSymbol;

  @ApiModelProperty({ description: '提币手续费数量' })
  @Column()
  public withdrawalFeeAmount: number;

  @ApiModelProperty({ description: '提币手续费单位符号' })
  @Column({ enum: CoinSymbol, type: 'enum' })
  public withdrawalFeeSymbol: CoinSymbol;

  @Exclude()
  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @ApiModelProperty()
  @UpdateDateColumn()
  public updatedAt: Date;
}

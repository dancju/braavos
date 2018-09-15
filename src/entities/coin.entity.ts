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
  @ApiModelProperty()
  @PrimaryColumn({ enum: CoinSymbol, type: 'enum' })
  public symbol: CoinSymbol;

  @Column()
  public chain: Chain;

  @ApiModelProperty()
  @Column()
  public depositFeeAmount: number;

  @ApiModelProperty()
  @Column({ enum: CoinSymbol, type: 'enum' })
  public depositFeeSymbol: CoinSymbol;

  @ApiModelProperty()
  @Column()
  public withdrawalFeeAmount: number;

  @ApiModelProperty()
  @Column({ enum: CoinSymbol, type: 'enum' })
  public withdrawalFeeSymbol: CoinSymbol;

  @Exclude()
  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @UpdateDateColumn()
  public updatedAt: Date;
}

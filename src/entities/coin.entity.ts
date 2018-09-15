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
  public depositFee: number;

  @ApiModelProperty()
  @Column()
  public withdrawalFee: number;

  @Exclude()
  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @UpdateDateColumn()
  public updatedAt: Date;
}

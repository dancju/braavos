import { ApiModelProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CryptoSymbol } from './crypto-symbol.enum';

@Entity()
export class Crypto extends BaseEntity {
  @ApiModelProperty()
  @PrimaryColumn({ enum: CryptoSymbol, type: 'enum' })
  public symbol: CryptoSymbol;

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

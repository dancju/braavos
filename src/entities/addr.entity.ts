import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Chain } from '../utils/chain.enum';
import { Client } from './client.entity';

@Entity()
@Index(['chain', 'addr'], { unique: true })
export class Addr extends BaseEntity {
  @PrimaryColumn({ enum: Chain, type: 'enum' })
  public chain: Chain;

  @PrimaryColumn()
  public clientId: number;

  @PrimaryColumn()
  public accountPath: string;

  @Column()
  public addr: string;

  @Column({ default: {}, type: 'jsonb' })
  public info: any;

  @CreateDateColumn()
  public createdAt: Date;

  @ManyToOne(() => Client)
  public client: Client;
}

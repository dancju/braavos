import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Client extends BaseEntity {
  @PrimaryGeneratedColumn()
  public id!: number;

  @Column()
  public name!: string;

  @Column()
  public publicKey!: string;

  @Column({ nullable: true })
  public privateKey?: string;

  @Column({ nullable: true })
  public depositEndpoint?: string;

  @Column({ nullable: true })
  public withdrawalEndpoint?: string;

  @Column({ nullable: true })
  public ip?: string;
}

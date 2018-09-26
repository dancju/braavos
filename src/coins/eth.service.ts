import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService, InjectConfig } from 'nestjs-config';
import { Repository } from 'typeorm';
import { EthereumService } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Client } from '../entities/client.entity';
import { Coin } from '../entities/coin.entity';

const { CFC, ETH } = CoinEnum;

@Injectable()
export class EthService extends EthereumService implements ICoinService {
  protected readonly coin: Promise<Coin>;

  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
  ) {
    super(config);
    this.coin = Coin.findOne(ETH) as Promise<Coin>;

    // init for debug
    try {
      (async () => {
        const pp = await Client.createQueryBuilder()
          .insert()
          .into(Client)
          .values({
            name: 'sss',
            publicKey: 'www',
          })
          .onConflict('("name") DO NOTHING')
          .returning('id')
          .execute();
        try {
          await Account.createQueryBuilder()
            .insert()
            .into(Account)
            .values({
              clientId: pp.raw[0].id,
              coinSymbol: ETH,
            })
            .onConflict('("clientId", "coinSymbol") DO NOTHING')
            .execute();
          await Account.createQueryBuilder()
            .insert()
            .into(Account)
            .values({
              clientId: pp.raw[0].id,
              coinSymbol: CFC,
            })
            .onConflict('("clientId", "coinSymbol") DO NOTHING')
            .execute();
        } catch (err) {
          console.log(err);
        }
        const qq = await this.getAddr(Number(pp.raw[0].id), '20/33');
        const dd = await this.getAddr(Number(pp.raw[0].id), '20/66');
        await Client.createQueryBuilder()
          .insert()
          .into(Client)
          .values({
            name: 'xx',
            publicKey: 'sdzz',
          })
          .onConflict('("name") DO NOTHING')
          .execute();
      })();
    } catch (err) {
      console.log(err);
    }
  }
}

// tslint:disable:no-submodule-imports
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import Wallet from 'ethereumjs-wallet';
import { Cron } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import {
  EntityManager,
  getManager,
  Repository,
  Transaction,
  TransactionManager,
} from 'typeorm';
import Web3 from 'web3';
import { Signature } from 'web3/eth/accounts';
import { AmqpService } from '../amqp/amqp.service';
import { EthereumService } from '../chains';
import { ChainEnum } from '../chains/chain.enum';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Client } from '../entities/client.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';
import { KvPair } from '../entities/kv-pair.entity';
import { WithdrawalStatus } from '../entities/withdrawal-status.enum';
import { Withdrawal } from '../entities/withdrawal.entity';

const { CFC, ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class EthService extends EthereumService implements ICoinService {
  protected readonly coin: Promise<Coin>;

  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
  ) {
    super(config);
    this.coin = new Promise(async (resolve) => {
      let res = await Coin.findOne(ETH);
      if (res) {
        resolve(res);
      } else {
        res = await Coin.create({
          chain: ethereum,
          depositFeeAmount: 0,
          depositFeeSymbol: ETH,
          symbol: ETH,
          withdrawalFeeAmount: 0,
          withdrawalFeeSymbol: ETH,
        });
        res.info = { cursor: 0, fee: 0 };
        await res.save();
        resolve(res);
      }
    });
    (async () => {
      await KvPair.query(
        `insert into kv_pair (key, "value") values ('ethWithdrawalNonce', '0'::jsonb) ON CONFLICT (key) DO NOTHING`,
      );
    })();

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

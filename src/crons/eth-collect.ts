import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import {
  AdvancedConsoleLogger,
  EntityManager,
  getManager,
  Repository,
  Transaction,
  TransactionManager,
} from 'typeorm';
import Web3 from 'web3';
import { Signature } from 'web3/eth/accounts';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum, EthereumService } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';

const { ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class EthCollect extends NestSchedule {
  private readonly web3: Web3;
  private readonly config: ConfigService;
  private readonly amqpService: AmqpService;
  private ethereumService: EthereumService;

  constructor(
    config: ConfigService,
    web3: Web3,
    amqpService: AmqpService,
    ethereumService: EthereumService,
  ) {
    super();
    this.config = config;
    this.web3 = web3;
    this.amqpService = amqpService;
    this.ethereumService = ethereumService;
  }

  @Cron('*/50 * * * * *', { startTime: new Date() })
  public async collectCron(): Promise<void> {
    if (this.ethereumService.cronLock.collectCron === true) {
      console.log('last collectCron still in handling');
      return;
    }
    this.ethereumService.cronLock.collectCron = true;
    try {
      const confTxs = await Deposit.createQueryBuilder()
        .select()
        .where({ coinSymbol: ETH, status: DepositStatus.confirmed })
        .getMany();
      if (confTxs.length <= 0) {
        this.ethereumService.cronLock.collectCron = false;
        return;
      }
      await Promise.all(
        confTxs.map(async (tx: Deposit) => {
          const thisAddr = await this.ethereumService.getAddr(
            Number(tx.clientId),
            tx.addrPath,
          );
          const fullNodeNonce = await this.web3.eth.getTransactionCount(
            thisAddr,
          );
          let dbNonce: any;
          if (tx.info.nonce === undefined || tx.info.nonce === null) {
            await getManager().transaction(async (manager) => {
              await manager.query(`
              select * from addr
              where chain = '${ethereum}' and "clientId" = ${
                tx.clientId
              } and path = '${tx.addrPath}'
              for update
            `);
              const uu = await manager.query(`
              update addr
              set info = (info || ('{"nonce":' || ((info->>'nonce')::int + 1) || '}')::jsonb)
              where chain = '${ethereum}' and "clientId" = ${
                tx.clientId
              } and path = '${tx.addrPath}'
              returning info->'nonce' as nonce`);
              dbNonce = uu[0].nonce;
              dbNonce = dbNonce - 1;
              await manager.query(`
              update deposit
              set info = (info || ('{"nonce":' || (${dbNonce}) || '}')::jsonb)
              where id = ${tx.id}
            `);
            });
          } else {
            dbNonce = tx.info.nonce;
          }
          /* compare nonce db - fullNode */
          if (dbNonce < fullNodeNonce) {
            // logger.fatal(`db nonce is less than full node nonce db info: ${tx}`);
            return;
          } else if (dbNonce > fullNodeNonce) {
            // logger.info(`still have some txs to be handled | eth`);
            return;
          } else {
            /* dbNonce === fullNodeNonce, broadcast transaction */
            const collectAddr = await this.ethereumService.getAddr(0, '0');
            const balance = await this.web3.eth.getBalance(thisAddr);
            const prv = this.ethereumService.getPrivateKey(
              tx.clientId,
              tx.addrPath,
            );
            const realGasPrice = await this.web3.eth.getGasPrice();
            const thisGasPrice = this.web3.utils
              .toBN(realGasPrice)
              .add(this.web3.utils.toBN(30000000000));
            const txFee = this.web3.utils.toBN(21000).mul(thisGasPrice);
            let value = this.web3.utils.toBN(balance);
            value = value.sub(txFee);
            const signTx = (await this.web3.eth.accounts.signTransaction(
              {
                gas: 21000,
                gasPrice: thisGasPrice.toString(),
                nonce: dbNonce,
                to: collectAddr,
                value: value.toString(),
              },
              prv,
            )) as Signature;
            console.log('collect signTx', signTx.rawTransaction);
            try {
              await this.web3.eth
                .sendSignedTransaction(signTx.rawTransaction)
                .on('transactionHash', async (hash) => {
                  console.log('collect hash: ', hash);
                  await Deposit.createQueryBuilder()
                    .update()
                    .set({ status: DepositStatus.finished })
                    .where({ id: tx.id })
                    .execute();
                });
            } catch (err) {
              // logger.error
              console.log(err);
            }
          }
        }),
      );
      this.ethereumService.cronLock.collectCron = false;
      console.log('finish collect');
      return;
    } catch (err) {
      console.log(err);
      this.ethereumService.cronLock.collectCron = false;
    }
  }
}

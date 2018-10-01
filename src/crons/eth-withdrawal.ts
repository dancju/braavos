import { Injectable } from '@nestjs/common';
import bunyan from 'bunyan';
import { Cron, NestSchedule } from 'nest-schedule';
import { getManager } from 'typeorm';
import Web3 from 'web3';
import { Signature } from 'web3/eth/accounts';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum, EthService } from '../coins';
import { ConfigService } from '../config/config.service';
import { WithdrawalStatus } from '../entities/withdrawal-status.enum';
import { Withdrawal } from '../entities/withdrawal.entity';

const { ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class EthWithdrawal extends NestSchedule {
  private readonly web3: Web3;
  private readonly config: ConfigService;
  private readonly logger: bunyan;
  private readonly amqpService: AmqpService;
  private ethereumService: EthService;
  private cronLock: any;

  constructor(
    config: ConfigService,
    logger: bunyan,
    web3: Web3,
    amqpService: AmqpService,
    ethereumService: EthService,
  ) {
    super();
    this.config = config;
    this.logger = logger;
    this.web3 = web3;
    this.amqpService = amqpService;
    this.ethereumService = ethereumService;
    this.cronLock = {
      withdrawalCron: false,
    };
  }

  @Cron('*/20 * * * * *', { startTime: new Date() })
  public async withdrawalCron(): Promise<void> {
    if (this.cronLock.withdrawalCron === true) {
      this.logger.warn('last withdrawalCron still in handling');
      return;
    }
    this.cronLock.withdrawalCron = true;
    try {
      const collectAddr = await this.ethereumService.getAddr(0, '0');
      const prv = this.ethereumService.getPrivateKey(0, '0');
      while (true) {
        const wd = await Withdrawal.createQueryBuilder()
          .where({
            coinSymbol: 'ETH',
            status: WithdrawalStatus.created,
            txHash: null,
          })
          .orderBy(`info->'nonce'`)
          .getMany();
        if (wd.length <= 0) {
          // logger.debug('no record')
          break;
        }
        for (const i in wd) {
          if (!wd[i]) {
            continue;
          }
          let dbNonce: any;
          const fullNodeNonce = await this.web3.eth.getTransactionCount(
            collectAddr,
          );
          if (wd[i].info.nonce === null || wd[i].info.nonce === undefined) {
            await getManager().transaction(async (manager) => {
              await manager.query(`
              select * from kv_pair
              where key = 'ethWithdrawalNonce'
              for update
            `);
              const uu = await manager.query(`
              update kv_pair
              set value = to_json(value::text::integer + 1)
              where key = 'ethWithdrawalNonce'
              returning value as nonce`);
              dbNonce = uu[0].nonce;
              dbNonce = dbNonce - 1;
              await manager.query(`
              update withdrawal
              set info = (info || ('{"nonce":' || (${dbNonce}) || '}')::jsonb)
              where id = ${wd[i].id}
            `);
            });
          } else {
            dbNonce = wd[i].info.nonce;
          }
          /* compare nonce: db - fullNode */
          if (dbNonce < fullNodeNonce) {
            // logger.fatal(`db nonce is less than full node nonce, db info: ${wd}`);
            return;
          } else if (dbNonce > fullNodeNonce) {
            // logger.info('still have some txs to be handled');
            continue;
          } else {
            /* dbNonce === fullNodeNonce, broadcast transaction */
            const realGasPrice = await this.web3.eth.getGasPrice();
            /* add 30Gwei */
            const thisGasPrice = this.web3.utils
              .toBN(realGasPrice)
              .add(this.web3.utils.toBN(30000000000))
              .toString();
            const value = this.web3.utils.toBN(
              this.web3.utils.toWei(wd[i].amount, 'ether'),
            );
            const balance = await this.web3.eth.getBalance(collectAddr);
            if (this.web3.utils.toBN(balance).lte(value)) {
              this.logger.error('wallet balance not enough');
              this.cronLock.withdrawalCron = false;
              return;
            }
            const signTx = (await this.web3.eth.accounts.signTransaction(
              {
                gas: 22000,
                gasPrice: thisGasPrice,
                nonce: dbNonce,
                to: wd[i].recipient,
                value: value.toString(),
              },
              prv,
            )) as Signature;
            this.logger.debug(`
              gasPrice: ${thisGasPrice}
              rawTransaction: ${signTx.rawTransaction}
            `);
            try {
              await this.web3.eth
                .sendSignedTransaction(signTx.rawTransaction)
                .on('transactionHash', async (hash) => {
                  this.logger.info('withdrawTxHash: ' + hash);
                  await Withdrawal.createQueryBuilder()
                    .update()
                    .set({ txHash: hash, status: WithdrawalStatus.finished })
                    .where({ id: wd[i].id })
                    .execute();
                  const ww = await Withdrawal.findOne({ id: wd[i].id });
                  if (ww) {
                    await this.amqpService.updateWithdrawal(ww);
                  }
                  // logger.info('Finish update db');
                });
            } catch (error) {
              // logger.error(error);
            }
          }
        }
      }
      this.cronLock.withdrawalCron = false;
      this.logger.debug('finish withdraw ether');
      return;
    } catch (err) {
      this.logger.error(err);
      this.cronLock.withdrawalCron = false;
    }
  }
}

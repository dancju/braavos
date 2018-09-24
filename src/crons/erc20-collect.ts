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
export abstract class Erc20Collect extends NestSchedule {
  private readonly web3: Web3;
  private readonly config: ConfigService;
  private readonly amqpService: AmqpService;
  private readonly abi: any;
  private readonly coinSymbol: CoinEnum;
  private cronLock: any;
  private tokenService: any;

  constructor(
    config: ConfigService,
    web3: Web3,
    amqpService: AmqpService,
    coinSymbol: CoinEnum,
    tokenService: any,
  ) {
    super();
    this.config = config;
    this.web3 = web3;
    this.amqpService = amqpService;
    this.coinSymbol = coinSymbol;
    this.cronLock = {
      collectCron: false,
    };
    this.tokenService = tokenService;
    this.abi = tokenService.abi;
  }

  @Configurable()
  @Cron('*/15 * * * * *', { startTime: new Date() })
  public async collectCron(): Promise<void> {
    if (this.cronLock.collectCron === true) {
      console.log('erc20 collect cron lock');
      return;
    }
    try {
      this.cronLock.collectCron = true;
      const contractAddr: string = this.config.get(
        `erc20.${this.coinSymbol}.collect.contractAddr`,
      );
      const decimals: number = this.config.get(
        `erc20.${this.coinSymbol}.collect.decimals`,
      );
      const contract = new this.web3.eth.Contract(this.abi, contractAddr);
      /* query & update confirmed transactions */
      const confTx = await Deposit.createQueryBuilder()
        .select()
        .where({ coinSymbol: this.coinSymbol, status: DepositStatus.confirmed })
        .getMany();
      if (confTx.length <= 0) {
        this.cronLock.collectCron = false;
        return;
      }
      await Promise.all(
        confTx.map(async (tx) => {
          if (!tx.info.collectHash) {
            return;
          }
          const thisAddr = await this.tokenService.getAddr(
            tx.clientId,
            tx.addrPath,
          );
          const fullNodeNonce = await this.web3.eth.getTransactionCount(
            thisAddr,
          );
          /* nonce is always eth nonce */
          let dbNonce;
          if (tx.info.nonce === undefined || tx.info.nonce === null) {
            await getManager().transaction(async (manager) => {
              await manager.query(`
                select * from addr
                where chain = '${ethereum}'
                and "clientId" = ${tx.clientId} and path = '${tx.addrPath}'
                for update
              `);
              const uu = await manager.query(`
                update addr
                set info = (info || ('{"nonce":' || ((info->>'nonce')::int + 1) || '}')::jsonb)
                where chain = '${ethereum}'
                and "clientId" = ${tx.clientId} and path = '${tx.addrPath}'
                returning info->'nonce' as nonce
              `);
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
            // logger.info(`still have some txs to be handled | ${tokenName}`);
            return;
          } else {
            /* dbNonce === fullNodeNoce, broadcast transaction */

            /* judge whether collect value has been sent to account */
            const collectHash = tx.info.collectHash;
            if (!collectHash) {
              // logger.debug('');
              return;
            }
            const collectBalance = this.web3.utils.toBN(
              await this.web3.eth.getBalance(thisAddr),
            );
            const checkCollect = await this.web3.eth.getTransaction(
              collectHash,
            );
            if (!checkCollect.blockNumber) {
              return;
            }

            const balance = await contract.methods.balanceOf(thisAddr).call();
            const prv = this.tokenService.getPrivateKey(
              tx.clientId,
              tx.addrPath,
            );

            const stringAmount = tx.amount.split('.');
            const preAmount = this.web3.utils.toBN(
              stringAmount[0] + stringAmount[1],
            );

            let collectValue: string;
            /* check whether real erc20 balance is more than db record */
            if (decimals <= 8) {
              collectValue = preAmount
                .div(this.web3.utils.toBN(Math.pow(10, 8 - decimals)))
                .toString();
            } else {
              collectValue = preAmount
                .mul(this.web3.utils.toBN(Math.pow(10, decimals - 8)))
                .toString();
            }
            if (
              this.web3.utils
                .toBN(balance)
                .lt(this.web3.utils.toBN(collectValue))
            ) {
              // logger.error(`erc20 balance is less than than db record | address: ${thisAddr}`);
              return;
            }
            const collectAddr = await this.tokenService.getAddr(0, '0');
            const method = contract.methods.transfer(collectAddr, collectValue);
            let txData;
            try {
              txData = await method.encodeABI();
              await method.estimateGas({ from: thisAddr });
            } catch (error) {
              // logger.error(error);
              return;
            }
            const gasLimit = tx.info.gasLimit;
            const thisGasPrice = tx.info.gasPrice;
            const gasFee = this.web3.utils
              .toBN(gasLimit)
              .mul(this.web3.utils.toBN(thisGasPrice));
            if (collectBalance.lt(gasFee)) {
              // logger.error("wallet balance is not enough");
              return;
            }
            const signTx = (await this.web3.eth.accounts.signTransaction(
              {
                data: txData,
                gas: gasLimit,
                gasPrice: thisGasPrice.toString(),
                nonce: dbNonce,
                to: contract.options.address,
              },
              prv,
            )) as Signature;
            try {
              await this.web3.eth
                .sendSignedTransaction(signTx.rawTransaction)
                .on('transactionHash', async (hash) => {
                  // logger.info("collectTxHash: " + hash + " | tokenName: " + tokenName);
                  console.log(`collect ${this.coinSymbol} hash: `, hash);
                  tx.status = DepositStatus.finished;
                  await tx.save();
                });
            } catch (error) {
              // logger.error(error);
            }
          }
        }),
      );
      // logger.debug('finish collect');
      console.log(`finish ${this.coinSymbol} collect`);
      this.cronLock.collectCron = false;
      return;
    } catch (err) {
      console.log(err);
      this.cronLock.collectCron = false;
    }
  }
}

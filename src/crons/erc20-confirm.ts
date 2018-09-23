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
export abstract class Erc20Confirm extends NestSchedule {
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
      confirmCron: false,
      payPreFeeCron: false,
    };
    this.tokenService = tokenService;
    this.abi = tokenService.abi;
  }

  @Configurable()
  @Cron('*/30 * * * * *', { startTime: new Date() })
  public async confirmCron(): Promise<void> {
    if (this.cronLock.confirmCron === true) {
      console.log('erc20 confirm cron lock');
      return;
    }
    try {
      this.cronLock.confirmCron = true;
      const confThreshold: number = this.config.get(
        `erc20.${this.coinSymbol}.collect.confThreshold`,
      );
      const uu = await Deposit.createQueryBuilder()
        .select()
        .where({
          coinSymbol: this.coinSymbol,
          status: DepositStatus.unconfirmed,
        })
        .getMany();
      if (uu.length <= 0) {
        this.cronLock.confirmCron = false;
        return;
      }
      const height = await this.web3.eth.getBlockNumber();
      await Promise.all(
        uu.map(async (tx: Deposit) => {
          const blockHeight = tx.info.blockHeight;
          if (height - blockHeight < confThreshold) {
            return;
          }
          await getManager().transaction(async (manager) => {
            await manager
              .createQueryBuilder()
              .update(Deposit)
              .set({ status: DepositStatus.confirmed })
              .where({ id: tx.id })
              .execute();
            await manager
              .createQueryBuilder(Account, 'account')
              .where({ clientId: tx.clientId, coinSymbol: this.coinSymbol })
              .setLock('pessimistic_write')
              .getOne();
            await manager.increment(
              Account,
              { clientId: tx.clientId, coinSymbol: this.coinSymbol },
              'balance',
              Number(tx.amount),
            );
            console.log('erc20 confirm: ', tx.id);
          });
        }),
      );
      this.cronLock.confirmCron = false;
      return;
    } catch (err) {
      this.cronLock.confirmCron = false;
    }
  }

  @Configurable()
  @Cron('*/30 * * * * *', { startTime: new Date() })
  public async payPreFee(): Promise<void> {
    if (this.cronLock.payPreFeeCron === true) {
      console.log('erc20 pay pre fee cron lock');
      return;
    }
    try {
      this.cronLock.payPreFeeCron = true;
      const contractAddr: string = this.config.get(
        `erc20.${this.coinSymbol}.collect.contractAddr`,
      );
      const pocketAddr: string = this.config.get(
        `erc20.${this.coinSymbol}.collect.pocketAddr`,
      );
      const pocketPrv: string = this.config.get(
        `erc20.${this.coinSymbol}.collect.pocketPrv`,
      );
      const decimals: number = this.config.get(`erc20.${this.coinSymbol}.collect.decimals`);
      const uu = await Deposit.createQueryBuilder()
        .select()
        .where({ coinSymbol: this.coinSymbol, status: DepositStatus.confirmed })
        .getMany();
      if (uu.length <= 0) {
        this.cronLock.payPreFeeCron = false;
        return;
      }
      const contract = new this.web3.eth.Contract(this.abi, contractAddr);
      const collectAddr = await this.tokenService.getAddr(0, '0');
      for (const tx of uu) {
        if (tx.info.collectHash) {
          continue;
        }
        const thisAddr = await this.tokenService.getAddr(
          tx.clientId,
          tx.addrPath,
        );
        const stringAmount = tx.amount.split('.');
        const preAmount = this.web3.utils.toBN(stringAmount[0] + stringAmount[1]);

        let collectValue: string;
        // check whether real erc20 balance is more than db record
        if (decimals <= 8) {
          collectValue = preAmount
            .div(this.web3.utils.toBN(Math.pow(10, 8 - decimals)))
            .toString();
        } else {
          collectValue = preAmount
            .mul(this.web3.utils.toBN(Math.pow(10, decimals - 8)))
            .toString();
        }
        const method = contract.methods.transfer(collectAddr, collectValue);
        let txData;
        let gasLimit;
        try {
          txData = await method.encodeABI();
          gasLimit = await method.estimateGas({ from: thisAddr });
        } catch (error) {
          // logger.error(error);
          console.log(error);
          continue;
        }
        const realGasPrice = await this.web3.eth.getGasPrice();
        const thisGasPrice = this.web3.utils
          .toBN(realGasPrice)
          .add(this.web3.utils.toBN(10000000000));

        /* check if balance of pocket address is enough to pay this fee */
        const gasFee = this.web3.utils
          .toBN(gasLimit)
          .mul(this.web3.utils.toBN(thisGasPrice));
        const pocketBalance = this.web3.utils.toBN(
          await this.web3.eth.getBalance(pocketAddr),
        );
        if (pocketBalance.lt(gasFee)) {
          // logger.error("pocket wallet balance is not enough");
          this.cronLock.payPreFeeCron = false;
          return;
        }

        /* send ether to address to pay erc20 transfer fee */
        const prePayGasPrice = this.web3.utils
          .toBN(realGasPrice)
          .add(this.web3.utils.toBN(10000000000));
        const etherSignTx = (await this.web3.eth.accounts.signTransaction(
          {
            gas: 21000,
            gasPrice: prePayGasPrice.toString(),
            to: thisAddr,
            value: gasFee.toString(),
          },
          pocketPrv,
        )) as Signature;

        try {
          await this.web3.eth
            .sendSignedTransaction(etherSignTx.rawTransaction)
            .on('transactionHash', async (hash) => {
              // logger.warn("preSendEtherTxHash: " + hash + " | tokenName: " + tokenName);
              console.log('preSendEtherTxHash: ' + hash);
              tx.info.gasLimit = gasLimit;
              tx.info.gasPrice = thisGasPrice;
              tx.info.collectHash = hash;
              await tx.save();
            });
        } catch (error) {
          console.log(error);
          // logger.error(error);
        }
      }
      this.cronLock.payPreFeeCron = false;
      console.log('finish pay pre fee');
      return;
    } catch (err) {
      console.log(err);
      this.cronLock.payPreFeeCron = false;
    }
  }
}

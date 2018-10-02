import { Injectable } from '@nestjs/common';
import bunyan from 'bunyan';
import { Cron, NestSchedule } from 'nest-schedule';
import Web3 from 'web3';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { ConfigService } from '../config/config.service';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';

const { ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export abstract class Erc20Deposit extends NestSchedule {
  private readonly config: ConfigService;
  private readonly logger: bunyan;
  private readonly amqpService: AmqpService;
  private readonly web3: Web3;
  private readonly abi: any;
  private readonly coinSymbol: CoinEnum;
  private readonly cronLock: any;

  constructor(
    config: ConfigService,
    logger: bunyan,
    amqpService: AmqpService,
    web3: Web3,
    coinSymbol: CoinEnum,
    abi: any,
  ) {
    super();
    this.config = config;
    this.logger = logger;
    this.web3 = web3;
    this.amqpService = amqpService;
    this.coinSymbol = coinSymbol;
    this.abi = abi;
    this.cronLock = {
      depositCron: false,
    };
  }

  @Cron('*/20 * * * * *', { startTime: new Date() })
  public async depositCron(): Promise<void> {
    if (this.cronLock.depositCron === true) {
      this.logger.warn('last erc20 depositCron still in handling');
      return;
    }
    this.cronLock.depositCron = true;
    try {
      const abiFrom = this.config.ethereum.get(this.coinSymbol).deposit._from;
      const abiTo = this.config.ethereum.get(this.coinSymbol).deposit._to;
      const abiValue = this.config.ethereum.get(this.coinSymbol).deposit._value;
      const contractAddr = this.config.ethereum.get(this.coinSymbol)
        .contractAddr;
      const decimals = this.config.ethereum.get(this.coinSymbol).deposit
        .decimals;
      const minThreshold = this.config.ethereum.get(this.coinSymbol).deposit
        .minThreshold;
      const step = this.config.ethereum.get(this.coinSymbol).deposit.step;
      const coin = await Coin.findOne(this.coinSymbol);
      if (!coin) {
        return;
      }
      const contract = new this.web3.eth.Contract(this.abi, contractAddr);
      /**
       * query blockIndex from db
       * @param blockIndex already handled block
       */
      let blockIndex = coin.info.cursor;
      /* add 1 to be the first unhandled block */
      blockIndex = blockIndex + 1;

      let height = await this.web3.eth.getBlockNumber();
      if (height < blockIndex) {
        this.logger.warn(
          'Ethereum full node is lower than db | tokenName: ' + this.coinSymbol,
        );
        this.cronLock.depositCron = false;
        return;
      }
      height = Math.min(height, blockIndex + step - 1);
      const events = await contract.getPastEvents('Transfer', {
        fromBlock: blockIndex,
        toBlock: height,
      });
      this.logger.debug('erc20 blockIndex: ', blockIndex);
      for (const e of events) {
        const eIndex = e.blockNumber;
        /* catch up eIndex */
        for (; blockIndex <= eIndex - 1; blockIndex++) {
          this.logger.debug(
            'blockIndex: ' + blockIndex + ' | tokenName: ' + this.coinSymbol,
          );
          /* update db block index */
          coin.info.cursor = blockIndex;
          await coin.save();
        }
        blockIndex = eIndex;
        /* handle this event */
        const txHash = e.transactionHash;
        const tokenTx = e.returnValues;
        /* the parameters here depends on the structure of contract */
        const fromAddr = tokenTx[abiFrom];
        const recipientAddr = tokenTx[abiTo];
        const amount = tokenTx[abiValue].toString();
        if (recipientAddr !== undefined) {
          const user = await Addr.createQueryBuilder()
            .where({ addr: recipientAddr, chain: ethereum })
            .getOne();
          if (user) {
            // if deposit amount less than threshold, ignore it
            if (
              this.web3.utils
                .toBN(amount)
                .lt(this.web3.utils.toBN(minThreshold))
            ) {
              continue;
            }
            const checkTx = await Deposit.createQueryBuilder()
              .where({
                coinSymbol: this.coinSymbol,
                txHash,
              })
              .getOne();
            if (!checkTx) {
              let dbAmount = '';
              let cnt = 0;
              const len = amount.length;
              for (let i = len - 1; i >= 0; i--, cnt++) {
                dbAmount = amount[i] + dbAmount;
                if (cnt === decimals - 1) {
                  dbAmount = '.' + dbAmount;
                }
              }
              if (cnt < decimals) {
                while (cnt < decimals) {
                  dbAmount = '0' + dbAmount;
                  cnt++;
                }
                dbAmount = '0.' + dbAmount;
              } else if (cnt === decimals) {
                dbAmount = '0' + dbAmount;
              }
              let dbDecimal = 8;
              const tmp = dbAmount.split('.');
              dbAmount = '';
              for (
                let i = 0;
                i < tmp[1].length && dbDecimal > 0;
                i++, dbDecimal--
              ) {
                dbAmount = dbAmount + tmp[1][i];
              }
              dbAmount = tmp[0] + '.' + dbAmount;
              this.logger.debug(`erc20 deposit:
                amount: ${amount}
                clientId: ${user.clientId}
                txHash: ${txHash}
              `);
              const d = Deposit.create({
                addrPath: user.path,
                amount: dbAmount,
                clientId: user.clientId,
                coinSymbol: this.coinSymbol,
                feeAmount: 0,
                feeSymbol: ETH,
                status: DepositStatus.unconfirmed,
                txHash,
              });
              d.info = {
                blockHash: e.blockHash,
                blockHeight: e.blockNumber,
                recipientAddr,
                senderAddr: fromAddr,
              };
              await d.save();
              await this.amqpService.createDeposit(d);
            }
          }
        }
        coin.info.cursor = blockIndex;
        await coin.save();
        blockIndex += 1;
      }
      /* handle left block */
      for (; blockIndex <= height; blockIndex++) {
        this.logger.debug(
          'blockIndex: ' + blockIndex + ' | tokenName: ' + this.coinSymbol,
        );
        /* update db block index */
        coin.info.cursor = blockIndex;
        await coin.save();
      }
      this.cronLock.depositCron = false;
      return;
    } catch (err) {
      this.logger.error(err);
      this.cronLock.depositCron = false;
    }
  }
}

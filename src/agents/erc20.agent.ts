import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Cron } from 'nest-schedule';
import { ConfigParam, ConfigService, InjectConfig } from 'nestjs-config';
import Web3 from 'web3';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';
import { EtherAgent } from './ether.agent';

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

export abstract class Erc20Agent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly web3: Web3;
  private readonly etherAgent: EtherAgent;
  private readonly abi: any;
  private readonly symbol: CoinSymbol;

  constructor(
    config: ConfigService,
    web3: Web3,
    etherAgent: EtherAgent,
    coinSymbol: CoinSymbol,
    abi: any,
  ) {
    super();
    this.web3 = web3;
    this.etherAgent = etherAgent;
    this.abi = abi;
    this.symbol = coinSymbol;
    this.coin = new Promise(async (resolve) => {
      let res = await Coin.findOne(coinSymbol);
      if (res) {
        resolve(res);
      } else {
        res = await Coin.create({
          chain: ethereum,
          depositFeeAmount: 0,
          depositFeeSymbol: ETH,
          symbol: coinSymbol,
          withdrawalFeeAmount: 0,
          withdrawalFeeSymbol: ETH,
        });
        res.info = { cursor: 0, fee: 0 };
        await res.save();
        resolve(res);
      }
    });
  }

  public getAddr(clientId: number, path: string): Promise<string> {
    return this.etherAgent.getAddr(clientId, path);
  }

  public isValidAddress(addr: string): boolean {
    return this.etherAgent.isValidAddress(addr);
  }

  // TODO
  public async createWithdrawal(withdrawal: Withdrawal): Promise<void> {
    return;
  }

  // TODO
  @Cron('* */5 * * * *', { startTime: new Date() })
  public async refreshFee(): Promise<void> {
    return;
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async collectCron(): Promise<void> {
    return;
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async depositCron(
    @ConfigParam(`erc20.${this.coinSymbol}.deposit._from`) abiFrom: string,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit._to`) abiTo: string,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit._value`) abiValue: string,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.contractAddr`)
    contractAddr: string,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.decimals`) decimals: number,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.minThreshold`)
    minThreshold: number,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.step`) step: number,
  ): Promise<void> {
    const coin = await this.coin;
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
      // logger.warn("Ethereum full node is lower than db | tokenName: " + tokenName);
      return;
    }
    height = Math.min(height, blockIndex + step - 1);
    const events = await contract.getPastEvents('Transfer', {
      fromBlock: blockIndex,
      toBlock: height,
    });
    for (const e of events) {
      const eIndex = e.blockNumber;
      /* catch up eIndex */
      for (; blockIndex <= eIndex - 1; blockIndex++) {
        // logger.debug("blockIndex: " + blockIndex + " | tokenName: " + tokenName);
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
            this.web3.utils.toBN(amount).lt(this.web3.utils.toBN(minThreshold))
          ) {
            continue;
          }
          const checkTx = await Deposit
            .createQueryBuilder()
            .where({
              coinSymbol: this.symbol,
              txHash,
            })
            .getOne();
          if (!checkTx) {
            let dbAmount = '';
            let cnt = 0;
            const len = amount.length;
            const dbDecimals = 8;
            for (let i = len - 1; i >= 0; i--, cnt++) {
              dbAmount = amount[i] + dbAmount;
              if (cnt === 7) {
                dbAmount = '.' + dbAmount;
              }
            }
            if (cnt < 8) {
              while (cnt < 8) {
                dbAmount = '0' + dbAmount;
              }
              dbAmount = '0.' + dbAmount;
            }
            const d = await Deposit.create({
              addrPath: user.path,
              amount: dbAmount,
              clientId: user.clientId,
              coinSymbol: this.symbol,
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
          }

        }
      }
      coin.info.cursor = blockIndex;
      await coin.save();
      blockIndex += 1;
    }
    /* handle left block */
    for (; blockIndex <= height; blockIndex++) {
      // logger.debug("blockIndex: " + blockIndex + " | tokenName: " + tokenName);
      /* update db block index */
      coin.info.cursor = blockIndex;
      await coin.save();
    }
    return;
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async withdrawalCron(): Promise<void> {
    return;
  }

  protected getPrivateKey(derivePath: string): string {
    throw new NotImplementedException();
  }
}

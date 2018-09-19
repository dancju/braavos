import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Cron } from 'nest-schedule';
import { ConfigParam, ConfigService, InjectConfig } from 'nestjs-config';
import Web3 from 'web3';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { EtherAgent } from './ether.agent';

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

export abstract class Erc20Agent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly web3: Web3;
  private readonly etherAgent: EtherAgent;
  private readonly abi: any;

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
      @ConfigParam(`erc20.${this.coinSymbol}.deposit.contractAddr`) contractAddr: string,
      @ConfigParam(`erc20.${this.coinSymbol}.deposit.decimals`) decimals: number,
      @ConfigParam(`erc20.${this.coinSymbol}.deposit.minThreshold`) minThreshold: number,
      @ConfigParam(`erc20.${this.coinSymbol}.deposit.step`) step: number,
  ): Promise<void> {
    const coin = await this.coin;
    const contract  = new this.web3.eth.Contract(this.abi, contractAddr);
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
      for (; blockIndex <= eIndex - 1; blockIndex ++) {
        // logger.debug("blockIndex: " + blockIndex + " | tokenName: " + tokenName);
        /* update db block index */
      }
    }

    //     await pg.query(
    //       ` update kv_pairs set "value" = $1 where "key" = $2`,
    //       [blockIndex, tokenName + "Cursor"]
    //     );
    //   }

    //   blockIndex = eIndex;

    //   logger.debug("blockIndex: " + blockIndex + " | tokenName: " + tokenName);

    //   // handle this event
    //   const txHash = e.transactionHash;
    //   const tokenTx = e.returnValues;
    //   // the parameters here depends on the structure of contract
    //   const fromAddr = tokenTx[_from];
    //   const recipientAddr = tokenTx[_to];
    //   const amount = tokenTx[_value];

    //   if (recipientAddr !== undefined) {
    //     const user = (await pg.query(
    //       `
    //         select user_id
    //         from crypto_accounts
    //         where address = $1 and crypto = $2
    //       `,
    //       [recipientAddr, tokenName]
    //     )).rows[0];

    //     if (user !== undefined) {
    //       // if deposit amount less than threshold, ignore it
    //       if (web3.utils.toBN(amount).lt(web3.utils.toBN(collectThreshold))) {
    //         continue;
    //       }

    //       const checkTx = (await pg.query(
    //         `select * from "deposits" where "crypto" = $1 and "tx_hash" = $2`,
    //         [tokenName, txHash]
    //       )).rows[0];

    //       if (checkTx === undefined) {
    //         const bnAmount = web3.utils.toBN(amount);
    //         const bnDecimals = web3.utils.toBN(decimals);
    //         const dbDecimals = web3.utils.toBN(8);

    //         const amountLt = bnAmount.div(web3.utils.toBN(10).pow(bnDecimals));
    //         let amountRt = bnAmount.mod(web3.utils.toBN(10).pow(bnDecimals));
    //         if (dbDecimals.lt(bnDecimals)) {
    //           amountRt = amountRt.div(web3.utils.toBN(10).pow(bnDecimals.sub(dbDecimals)));
    //         }
    //         const dbAmount = amountLt.toString() + '.' + amountRt.toString();

    //         logger.info(`
    //         tokenName: ${tokenName}
    //         blockHash: ${e.blockHash}
    //         blockNumber: ${e.blockNumber}
    //         txHash: ${txHash}
    //         userId: ${user.user_id}
    //         recipientAddr: ${recipientAddr}
    //         dbAmount: ${dbAmount}
    //         `);

    //         await pg.query(
    //           `
    //             insert into "deposits" (
    //               "crypto", "block_hash", "block_height", "tx_hash", "sender_addr", "recipient_id", "recipient_addr", "amount",
    //               "status"
    //             ) values (
    //               $1, $2, $3, $4, $5, $6, $7, $8,
    //               'created'
    //             )
    //           `,
    //           [
    //             tokenName,
    //             e.blockHash,
    //             e.blockNumber,
    //             txHash,
    //             fromAddr,
    //             user.user_id,
    //             recipientAddr,
    //             dbAmount
    //           ]
    //         );
    //       }
    //     }
    //   }
    //   // update db block index
    //   await pg.query(
    //     `update kv_pairs set "value" = $1 where "key" = $2`,
    //     [blockIndex, tokenName + "Cursor"]
    //   );
    //   blockIndex += 1;
    // }

    // // handle left block
    // for (; blockIndex <= height; blockIndex++) {
    //   logger.debug("blockIndex: " + blockIndex + " | tokenName: " + tokenName);

    //   // update db block index
    //   await pg.query(
    //     `update kv_pairs set "value" = $1 where "key" = $2`,
    //     [blockIndex, tokenName + "Cursor"]
    //   );
    // }
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

import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { BIP32, fromBase58, fromSeed } from 'bip32';
import Wallet from 'ethereumjs-wallet';
import { fromExtendedKey } from 'ethereumjs-wallet/hdkey';
import { Cron } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import { getManager } from 'typeorm';
import Web3 from 'web3';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { KvPair } from '../entities/kv-pair.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';
import { WithdrawalStatus } from '../utils/withdrawal-status.enum';
import { EtherAgent } from './ether.agent';
import { Signature } from 'web3/eth/accounts';
import request from 'superagent';
import crypto from "crypto";
import querystring from "querystring";

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

export abstract class Erc20Agent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly prvNode: BIP32;
  private readonly pubNode: BIP32;
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
    const seed = config.get('crypto.seed')() as Buffer;
    const xPrv = fromSeed(seed)
      .derivePath(`m/44'/60'/0'/0'`)
      .toBase58();
    const xPub = fromExtendedKey(xPrv).publicExtendedKey();
    if (!xPrv.startsWith('xprv')) {
      throw Error();
    }
    if (!xPub.startsWith('xpub')) {
      throw Error();
    }
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

  @Configurable()
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
          const checkTx = await Deposit.createQueryBuilder()
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

  @Configurable()
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async withdrawalCron(
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.contractAddr`)
    contractAddr: string,
    @ConfigParam(`erc20.${this.coinSymbol}.deposit.decimals`) decimals: number,
    @ConfigParam('erc20.bmart.bmartHost') bmartHost: string,
    @ConfigParam('erc20.bmart.bmartKey') bmartKey: string,
    @ConfigParam('erc20.bmart.bmartSecret') bmartSecret: string,
  ): Promise<void> {
    // TBD bmart
    // const { bmartSecret, bmartKey, bmartHost } = bmartConfig;

    const contract = new this.web3.eth.Contract(this.abi, contractAddr);
    const collectAddr = Wallet.fromPublicKey(
      this.pubNode.derive(0).publicKey,
      true,
    ).getAddressString();
    const prv = this.getPrivateKey('0');

    while (true) {
      const wd = await Withdrawal.createQueryBuilder()
        .where({
          coinSymbol: this.symbol,
          status: WithdrawalStatus.created,
          txHash: null,
        })
        .orderBy(`info->'nonce'`)
        .getMany();
      if (wd.length <= 0) {
        // logger.debug('no record');
        break;
      }
      for (const i in wd) {
        if (!wd[i]) {
          continue;
        }
        let dbNonce: any;
        const fullNodeNonce = await this.web3.eth.getTransactionCount(collectAddr);
        if (wd[i].info.nonce === null || wd[i].info.nonce === undefined) {
          await getManager().transaction(async (manager) => {
            dbNonce = await manager
              .createQueryBuilder()
              .update(KvPair)
              .set({ value: `to_json(value::text:integer + 1)` })
              .where({ key: 'ethWithdrawalNonce' })
              .returning('value')
              .execute();
            dbNonce = dbNonce - 1;
            await manager
              .createQueryBuilder()
              .update(Withdrawal)
              .set({ nonce: dbNonce })
              .where({ id: wd[i].id })
              .execute();
          });
        } else {
          dbNonce = wd[i].info.nonce;
        }

        /* compare nonce db - fullNode */
        if (dbNonce < fullNodeNonce) {
          // logger.fatal(`still have some txs to be handled`);
          return;
        } else if (dbNonce > fullNodeNonce) {
          // logger.info('still have some txs to be handled');
          continue;
        } else {
          /* dbNonce === fullNodeNonce, broadcast transaction */
          const stringAmount = wd[i].amount.split('.');
          const preAmount = this.web3.utils.toBN(stringAmount[0] + stringAmount[1]);
          let amount: string;
          if (decimals <= 8) {
            amount = preAmount
              .div(this.web3.utils.toBN(Math.pow(10, 8 - decimals)))
              .toString();
          } else {
            amount = preAmount
              .mul(this.web3.utils.toBN(Math.pow(10, decimals - 8)))
              .toString();
          }
          const method = await contract.methods.transfer(wd[i].recipient, amount);
          let txData;
          let gasLimit;
          try {
            txData = await method.encodeABI();
            gasLimit = await method.estimateGas({ from: collectAddr });
          } catch (error) {
            // logger.error(error);
            return;
          }
          const realGasPrice = await this.web3.eth.getGasPrice();
          const thisGasPrice = this.web3.utils.toBN(realGasPrice).add(this.web3.utils.toBN(30000000000)).toString();
          /* Judge if collect wallet eth balance is suffient to pay the fee */
          const gasFee = this.web3.utils.toBN(gasLimit).mul(this.web3.utils.toBN(thisGasPrice));
          const collectBalance = this.web3.utils.toBN(
            await this.web3.eth.getBalance(collectAddr),
          );
          if (collectBalance.lt(gasFee)) {
            // logger.error("Collect wallet eth balance is not enough");
            return;
          }
          /* Judge if collect wallet has enough erc20 token */
          const ercBalance = await contract.methods.balanceOf(collectAddr).call();
          if (this.web3.utils.toBN(ercBalance).lt(this.web3.utils.toBN(amount))) {
            // logger.error(`erc20 balance is less than db record`);
            return;
          }
          /* start erc20 withdraw */
          // logger.info
          const signTx = (await this.web3.eth.accounts.signTransaction(
            {
              data: txData,
              gas: gasLimit,
              gasPrice: thisGasPrice,
              nonce: dbNonce,
              to: contract.options.address,
            },
            prv,
          )) as Signature;

          try {
            const tx = await this.web3.eth
              .sendSignedTransaction(signTx.rawTransaction)
              .on("transactionHash", async (hash) => {
                // logger.info("withdrawTxHash: " + hash + " | tokenName: " + tokenName);
                await Withdrawal.createQueryBuilder()
                  .update()
                  .set({ txHash: hash, status: WithdrawalStatus.finished })
                  .where({ id: wd[i].id })
                  .execute();
                // logger.info("Finish update db | tokenName: " + tokenName);
                if (wd[i].memo === "bmart") {
                  const bmartRes = await request
                    .post(`${bmartHost}/api/v1/withdraw/addWithdrawInfo`)
                    .query(
                      (() => {
                        const req: any = {
                          amount: wd[i].amount,
                          contractAddress: contractAddr,
                          from: collectAddr,
                          identify: 81,
                          key: bmartKey,
                          secret: bmartSecret,
                          to: wd[i].recipient,
                          txid: hash,
                        };
                        req.sign = crypto
                          .createHash("sha1")
                          .update(querystring.stringify(req))
                          .digest("hex");
                        delete req.secret;
                        return req;
                      })()
                    );
                    // logger.info("Finish datastream");
                }
            });
          } catch (error) {
            // logger.error(error);
          }
        }
      }
    }
    return;
  }

  protected getPrivateKey(derivePath: string): string {
    throw new NotImplementedException();
  }
}

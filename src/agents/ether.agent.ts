// tslint:disable:no-submodule-imports
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { BIP32, fromBase58, fromSeed } from 'bip32';
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import Wallet from 'ethereumjs-wallet';
import { fromExtendedKey } from 'ethereumjs-wallet/hdkey';
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
import { Account } from '../entities/account.entity';
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

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

@Injectable()
export class EtherAgent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly prvNode: BIP32;
  private readonly pubNode: BIP32;
  private readonly web3: Web3;

  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
    @Inject(Web3) web3: Web3,
    amqpService: AmqpService,
  ) {
    super(amqpService);
    const seed = config.get('crypto.seed')() as Buffer;
    const xPrv = fromSeed(seed)
      .derivePath(`m/44'/60'/0'/0`)
      .toBase58();
    const xPub = fromExtendedKey(xPrv).publicExtendedKey();
    if (!xPrv.startsWith('xprv')) {
      throw Error();
    }
    if (!xPub.startsWith('xpub')) {
      throw Error();
    }
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
        await res.save();
        resolve(res);
      }
    });
    this.prvNode = fromBase58(xPrv);
    this.pubNode = fromBase58(xPub);
    this.web3 = web3;
  }

  public async getAddr(clientId: number, path0: string): Promise<string> {
    const path1 = clientId + '/' + path0;
    const addr = toChecksumAddress(
      Wallet.fromPublicKey(
        this.pubNode.derivePath(path1).publicKey,
        true,
      ).getAddressString(),
    );
    await Addr.createQueryBuilder()
      .insert()
      .into(Addr)
      .values({
        addr,
        chain: ethereum,
        clientId,
        path: path1,
      })
      .onConflict('("chain", "clientId", "path") DO NOTHING')
      .execute();
    return addr;
  }

  public isValidAddress(addr: string): boolean {
    if (!/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
      return false;
    } else if (/^0x[0-9a-f]{40}$/.test(addr) || /^0x[0-9A-F]{40}$/.test(addr)) {
      return true;
    } else {
      return isValidChecksumAddress(addr);
    }
  }

  public async createWithdrawal(withdrawal: Withdrawal) {
    // TODO handle off-chain transactions
  }

  @Cron('* */1 * * * *', { startTime: new Date() })
  public async confirmCron(
    @ConfigParam('ethereum.ether.collect.confThreshold') confThreshold: number,
  ): Promise<void> {
    const uu = await Deposit.createQueryBuilder()
      .select()
      .where({ CoinSymbol: CoinSymbol.ETH, status: DepositStatus.unconfirmed })
      .orderBy('id')
      .execute();
    if (uu.length <= 0) {
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
            .where({ clientId: tx.clientId, coinSymbol: CoinSymbol.ETH })
            .setLock('pessimistic_write')
            .getOne();
          await manager.increment(
            Account,
            { clientId: tx.clientId, coinSymbol: CoinSymbol.ETH },
            'balance',
            Number(tx.amount),
          );
        });
      }),
    );
  }

  @Cron('* */5 * * * *', { startTime: new Date() })
  public async refreshFee(): Promise<void> {
    const gasPrice = await this.web3.eth.getGasPrice();
    const txFee = String(21000 * gasPrice);
    const value = this.web3.utils.fromWei(txFee, 'ether');
    const coin = await this.coin;
    coin.info.fee = value;
    await coin.save();
  }

  @Cron('* */1 * * * *', { startTime: new Date() })
  public async collectCron(): Promise<void> {
    const unconfTxs = await Deposit.createQueryBuilder()
      .select()
      .where({ coinSymbol: CoinSymbol.ETH, status: DepositStatus.confirmed })
      .execute();
    if (unconfTxs.length <= 0) {
      return;
    }
    await Promise.all(
      unconfTxs.map(async (tx: Deposit) => {
        const fullNodeNonce = await this.web3.eth.getTransactionCount(
          tx.info.recipientAddr,
        );
        let dbNonce: any;
        if (tx.info.nonce === undefined || tx.info.nonce === null) {
          await getManager().transaction(async (manager) => {
            dbNonce = await manager
              .createQueryBuilder()
              .update(Addr)
              .set({ 'info.nonce': `to_json(info.nonce::text::integer + 1)` })
              .where({
                chain: Chain.ethereum,
                clientId: tx.clientId,
                path: tx.addrPath,
              })
              .returning('info.nonce')
              .execute();
            dbNonce = dbNonce - 1;
            await manager
              .createQueryBuilder()
              .update(Deposit)
              .set({ 'info.nonce': dbNonce })
              .where({ coinSymbol: CoinSymbol.ETH, txHash: tx.txHash })
              .execute();
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
          const txHash = tx.txHash;
          const collectAddr = Wallet.fromPublicKey(
            this.pubNode.derive(0).publicKey,
            true,
          ).getAddressString();
          const thisAddr = await this.getAddr(tx.clientId, tx.addrPath);
          const balance = await this.web3.eth.getBalance(thisAddr);
          const prv = this.getPrivateKey(`${tx.clientId}/${tx.addrPath}`);
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

          try {
            await this.web3.eth
              .sendSignedTransaction(signTx.rawTransaction)
              .on('transactionHash', async (hash) => {
                await Deposit.createQueryBuilder()
                  .update()
                  .set({ status: DepositStatus.finished })
                  .where({ coinSymbol: CoinSymbol.ETH, txHash: tx.txHash })
                  .execute();
              });
          } catch (err) {
            // logger.error
          }
        }
      }),
    );
    return;
  }

  @Configurable()
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async depositCron(
    @ConfigParam('ethereum.ether.deposit.collectThreshold')
    collectThreshold: number,
    @ConfigParam('ethereum.ether.deposit.pocketAddr') pocketAddr: string,
    @ConfigParam('ethereum.ether.deposit.step') step: number,
  ): Promise<void> {
    const coin = await this.coin;
    /**
     * query blockIndex from db
     * @param blockIndex already handled block
     */
    let blockIndex = coin.info.cursor;
    // add 1 to be the first unhandled block
    blockIndex = blockIndex + 1;
    let height = await this.web3.eth.getBlockNumber();
    height = height - 3;
    if (height < blockIndex) {
      // logger.warn('Ethereum full node is lower than db');
      return;
    }
    height = Math.min(height, blockIndex + step - 1);
    // handle block
    for (; blockIndex <= height; blockIndex++) {
      // handle transactions
      const block = await this.web3.eth.getBlock(blockIndex, true);
      await Promise.all(
        block.transactions.map(async (tx) => {
          const receipt = await this.web3.eth.getTransactionReceipt(tx.hash);
          if (receipt.status === false) {
            return;
          }
          const user = await Addr.findOne({ addr: tx.to, chain: ethereum });
          if (!user) {
            return;
          }
          /* pocket address send ether to this address in order to pay erc20 transfer fee */
          if (tx.from === pocketAddr) {
            return;
          }
          /* tiny deposit, ignore it */
          if (
            this.web3.utils
              .toBN(tx.value)
              .lt(this.web3.utils.toBN(collectThreshold))
          ) {
            return;
          }
          const checkTx = await Deposit.findOne({
            coinSymbol: ETH,
            txHash: tx.hash,
          });
          if (!checkTx) {
            const amount = await this.web3.utils.fromWei(tx.value, 'ether');
            // logger.info(`
            //   blockHash: ${block.hash}
            //   blockNumber: ${block.number}
            //   txHash: ${tx.hash}
            //   userId: ${user.user_id}
            //   recipientAddr: ${tx.to}
            //   amount: ${amount}
            // `);
            const d = await Deposit.create({
              addrPath: user.path,
              amount: String(amount),
              clientId: user.clientId,
              coinSymbol: ETH,
              status: DepositStatus.unconfirmed,
              txHash: tx.hash,
            });
            d.info = {
              blockHash: block.hash,
              blockHeight: block.number,
              recipientAddr: tx.to,
              senderAddr: tx.from,
            };
            await d.save();
          } else {
            return;
          }
        }),
      );
      coin.info.cursor = blockIndex;
      await coin.save();
    }
  }

  @Configurable()
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async withdrawalCron(): Promise<void> {
    const collectAddr = Wallet.fromPublicKey(
      this.pubNode.derive(0).publicKey,
      true,
    ).getAddressString();
    const prv = this.getPrivateKey('0');
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
            dbNonce = await manager
              .createQueryBuilder()
              .update(KvPair)
              .set({ value: `to_json(value::text::integer + 1)` })
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
            // logger.error('wallet balance is not enough');
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
          // logger.info(`signTx gasPrice: ${thisGasPrice} rawTransaction: ${signTx.rawTransaction}`);
          try {
            await this.web3.eth
              .sendSignedTransaction(signTx.rawTransaction)
              .on('transactionHash', async (hash) => {
                // logger.info('withdrawTxHash: ' + hash);
                await Withdrawal.createQueryBuilder()
                  .update()
                  .set({ txHash: hash, status: WithdrawalStatus.finished })
                  .where({ id: wd[i].id })
                  .execute();
                // logger.info('Finish update db');
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
    return this.prvNode.derivePath(derivePath).toWIF();
  }
}

// tslint:disable:no-submodule-imports
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import {
  EthereumHDKey,
  fromExtendedKey,
  fromMasterSeed,
} from 'ethereumjs-wallet/hdkey';
import { Cron } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import { EntityManager, Repository } from 'typeorm';
import Web3 from 'web3';
import { Signature } from 'web3/eth/accounts';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

@Injectable()
export class EtherAgent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly prvNode: EthereumHDKey;
  private readonly pubNode: EthereumHDKey;
  private readonly web3: Web3;

  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
    @Inject(Web3) web3: Web3,
  ) {
    super();
    const seed = config.get('crypto.seed')() as Buffer;
    const xPrv = fromMasterSeed(seed)
      .derivePath(`m/44'/60'/0'/0`)
      .privateExtendedKey();
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
    this.prvNode = fromExtendedKey(xPrv);
    this.pubNode = fromExtendedKey(xPub);
    this.web3 = web3;
  }

  public async getAddr(clientId: number, path0: string): Promise<string> {
    const path1 = clientId + '/' + path0;
    const addr = toChecksumAddress(
      this.pubNode
        .derivePath(path1)
        .getWallet()
        .getAddressString(),
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

  @Cron('* */5 * * * *', { startTime: new Date() })
  public async refreshFee(): Promise<void> {
    const gasPrice = await this.web3.eth.getGasPrice();
    const txFee = (21000 * gasPrice).toString();
    const value = this.web3.utils.fromWei(txFee, 'ether');
    const coin = await this.coin;
    coin.info.fee = value;
    await coin.save();
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async collectCron(
    @ConfigParam('ethereum.ether.collect.confThreshold') confThreshold: number,
    @InjectEntityManager() manager: EntityManager,
  ): Promise<void> {
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
      // query & update unconfirmed transactions
      // logger.debug('blockIndex: ' + blockIndex);
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
          /**
           * pocket address send ether to this address
           * in order to pay erc20 transfer fee
           */
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

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public withdrawalCron(): Promise<void> {
    return;
  }

  protected getPrivateKey(derivePath: string): string {
    return this.prvNode
      .derivePath(derivePath)
      .getWallet()
      .getPrivateKeyString();
  }
}

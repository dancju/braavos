import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BIP32, fromBase58, fromSeed } from 'bip32';
import BtcRpc from 'bitcoin-core';
import BtcLib from 'bitcoinjs-lib';
import { Cron } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DepositStatus } from '../utils/deposit-status.enum';
import { WithdrawalStatus } from '../utils/withdrawal-status.enum';

const { BTC } = CoinSymbol;
const { bitcoin } = Chain;

@Injectable()
export class BitcoinAgent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly prvNode: BIP32;
  private readonly pubNode: BIP32;
  private readonly rpc: BtcRpc;
  private readonly bech32: boolean;

  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
    @Inject(BtcRpc) rpc: BtcRpc,
  ) {
    super();
    const seed = config.get('crypto.seed')() as Buffer;
    const xPrv = fromSeed(seed)
      .derivePath(`m/84'/0'/0'/0`)
      .toBase58();
    const xPub = fromBase58(xPrv)
      .neutered()
      .toBase58();
    this.bech32 = config.get('bitcoin.bech32') as boolean;
    if ('boolean' !== typeof this.bech32) {
      throw new InternalServerErrorException();
    }
    if (!xPrv.startsWith('xprv')) {
      throw new InternalServerErrorException();
    }
    if (!xPub.startsWith('xpub')) {
      throw new InternalServerErrorException();
    }
    this.coin = new Promise(async (resolve) => {
      let res = await Coin.findOne(BTC);
      if (res) {
        resolve(res);
      } else {
        res = await Coin.create({
          chain: bitcoin,
          depositFeeAmount: 0,
          depositFeeSymbol: BTC,
          symbol: BTC,
          withdrawalFeeAmount: 0,
          withdrawalFeeSymbol: BTC,
        });
        res.info = { cursor: 0 };
        await res.save();
        resolve(res);
      }
    });
    this.prvNode = fromBase58(xPrv);
    this.pubNode = fromBase58(xPub);
    this.rpc = rpc;
  }

  public async getAddr(clientId: number, path0: string): Promise<string> {
    const path1 = clientId + '/' + path0;
    const addr = this.bech32
      ? this.getAddrP2sh(path1)
      : this.getAddrP2wpkh(path1);
    if (
      !(await Addr.findOne({
        chain: bitcoin,
        clientId,
        path: path1,
      }))
    ) {
      await Addr.create({
        addr,
        chain: bitcoin,
        clientId,
        path: path1,
      }).save();
      await this.rpc.importPrivKey(this.getPrivateKey(path1), 'braavo', false);
    }
    return addr;
  }

  public isValidAddress(addr: string): boolean {
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(addr);
  }

  public async createWithdrawal(withdrawal: Withdrawal): Promise<void> {
    // this method is intentionally left empty
  }

  @Configurable()
  @Cron('* */10 * * * *', { startTime: new Date() })
  public async refreshFee(
    @ConfigParam('bitcoin.fee.confTarget') confTarget: number,
    @ConfigParam('bitcoin.fee.txSizeKb') txSizeKb: number,
  ): Promise<void> {
    const coin = await this.coin;
    const rpc = this.rpc;
    const feeRate = (await rpc.estimateSmartFee(confTarget)).feerate!;
    const fee = txSizeKb * feeRate;
    await Promise.all([
      rpc.setTxFee(feeRate),
      (async () => {
        coin.withdrawalFeeAmount = fee;
        await coin.save();
      })(),
    ]);
  }

  @Configurable()
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async depositCron(
    @ConfigParam('bitcoin.deposit.confThreshold') confThreshold: number,
    @ConfigParam('bitcoin.deposit.step') step: number,
  ): Promise<void> {
    while (true) {
      const coin = await this.coin;
      const txs = await this.rpc.listTransactions(
        'coinfair',
        step,
        coin.info.cursor,
      );
      if (txs.length === 0) {
        return;
      }
      for (const tx of txs) {
        if (await Deposit.findOne({ coinSymbol: BTC, txHash: tx.txid })) {
          continue;
        }
        const addr = await Addr.findOne({
          addr: tx.address,
          chain: bitcoin,
        });
        if (!addr) {
          // TODO log warn
        }
        Deposit.create({
          addrPath: addr.path,
          amount: String(tx.amount),
          clientId: addr.clientId,
          coinSymbol: BTC,
          txHash: tx.txid,
        }).save();
      }
      coin.info.cursor += txs.length;
      await coin.save();
    }
  }

  @Cron('* */10 * * * *', { startTime: new Date() })
  public async confirmCron(): Promise<void> {
    // TODO
    // TODO 增加客户余额，注意事务性
    for (const d of await Deposit.find({
      coinSymbol: BTC,
      status: DepositStatus.unconfirmed,
    })) {
      this.rpc.getTransactionByHash(d.txHash);
    }
  }

  @Configurable()
  @Cron('* */10 * * * *', { startTime: new Date() })
  public async withdrawalCron(
    @ConfigParam('bitcoin.withdrawal.step') step: number,
  ): Promise<void> {
    while (true) {
      // TODO handle idempotency
      const lW = await Withdrawal.createQueryBuilder()
        .where({
          coinSymbol: BTC,
          status: WithdrawalStatus.created,
        })
        .orderBy('id')
        .limit(step)
        .getMany();
      if (lW.length === 0) {
        return;
      }
      // TODO handle fee
      // TODO update client balance
      // TODO test grammar
      const txHash = await this.rpc.sendMany(
        'braavo',
        lW.reduce((acc: { [_: string]: string }, cur) => {
          acc[cur.recipient] = cur.amount;
          return acc;
        }, {}),
      );
      await Withdrawal.update(lW.map((w) => w.id), {
        status: WithdrawalStatus.finished,
        txHash,
      });
    }
  }

  protected getPrivateKey(derivePath: string): string {
    return this.prvNode.derivePath(derivePath).toWIF();
  }

  private getAddrP2sh(derivePath: string): string {
    const { address } = BtcLib.payments.p2sh({
      redeem: BtcLib.payments.p2wpkh({
        pubkey: this.pubNode.derivePath(derivePath).publicKey,
      }),
    });
    return address;
  }

  private getAddrP2wpkh(derivePath: string): string {
    const { address } = BtcLib.payments.p2wpkh({
      pubkey: this.pubNode.derivePath(derivePath).publicKey,
    });
    return address;
  }
}

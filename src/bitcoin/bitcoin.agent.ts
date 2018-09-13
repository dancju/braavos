import { InjectRepository } from '@nestjs/typeorm';
import { BIP32, fromBase58 } from 'bip32';
import * as BtcRpc from 'bitcoin-core';
import * as BtcLib from 'bitcoinjs-lib';
import { Cron } from 'nest-schedule';
import { ConfigParam, Configurable } from 'nestjs-config';
import { Repository } from 'typeorm';
import { CoinAgent } from '../utils/coin-agent';
import { CryptoSymbol } from '../utils/crypto-symbol.enum';
import { Crypto } from '../utils/crypto.entity';
import { Deposit } from '../utils/deposit.entity';
import { WithdrawalStatus } from '../utils/withdrawal-status.enum';
import { Withdrawal } from '../utils/withdrawal.entity';

export class BitcoinAgent extends CoinAgent {
  private crypto: Promise<Crypto>;
  private prvNode: BIP32;
  private pubNode: BIP32;
  private rpc: BtcRpc;

  constructor(
    @ConfigParam('crypto.bitcoinBech32') private readonly bech32: boolean,
    @ConfigParam('crypto.bitcoinXPrv') xPrv: string,
    @ConfigParam('crypto.bitcoinXPub') xPub: string,
    @ConfigParam('btc.rpc') rpcConfig,
    @InjectRepository(Deposit) protected readonly deposits: Repository<Deposit>,
    @InjectRepository(Withdrawal)
    protected readonly withdrawals: Repository<Withdrawal>,
  ) {
    super();
    if ('boolean' !== typeof bech32) {
      throw Error();
    }
    if (!xPrv.startsWith('xprv')) {
      throw Error();
    }
    if (!xPub.startsWith('xpub')) {
      throw Error();
    }
    this.crypto = new Promise(async (resolve) => {
      const res = await Crypto.create({ symbol: CryptoSymbol.BTC }).save();
      if (res.info.cursor === undefined) {
        res.info.cursor = 0;
        await res.save();
      }
      resolve(res);
    });
    this.prvNode = fromBase58(xPrv);
    this.pubNode = fromBase58(xPub);
    this.rpc = new BtcRpc(rpcConfig);
  }

  public getPrivateKey(clientId: number, accountPath: string): string {
    const derivePath = clientId + '/' + accountPath;
    return this.prvNode.derivePath(derivePath).toWIF();
  }

  public getAddr(clientId: number, accountPath: string): string {
    const derivePath = clientId + '/' + accountPath;
    if (this.bech32) {
      return this.getAddrBip173(derivePath);
    } else {
      return this.getAddrBip142(derivePath);
    }
  }

  public isValidAddress(addr: string): boolean {
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(addr);
  }

  public createWithdrawal(withdrawal: Withdrawal) {
    return;
  }

  @Configurable()
  @Cron('* */10 * * * *', { startTime: new Date() })
  public async refreshFee(
    @ConfigParam('btc.fee.confTarget') confTarget: number,
    @ConfigParam('btc.fee.txSizeKb') txSizeKb: number,
  ) {
    const crypto = await this.crypto;
    const rpc = this.rpc;
    const feeRate = (await rpc.estimateSmartFee(confTarget)).feerate!;
    const fee = txSizeKb * feeRate;
    await Promise.all([
      rpc.setTxFee(feeRate),
      (async () => {
        crypto.withdrawalFee = fee;
        await crypto.save();
      })(),
    ]);
  }

  @Configurable()
  @Cron('* */1 * * * *', { startTime: new Date() })
  public async depositCron(
    @ConfigParam('btc.deposit.confThreshold') confThreshold: number,
    @ConfigParam('btc.deposit.step') step: number,
  ) {
    // TODO
    // const cursor = (await this.crypto).info.cursor as number;
    // const txs = await this.rpc.listTransactions('coinfair', step, cursor);
    // if (txs.length === 0) {
    //   return;
    // }
    // for (const tx of txs) {
    //   const confirmed = tx.confirmations >= confThreshold;
    //   let txPg = (await pg.query(
    //     `select * from deposits where crypto = 'BTC' and tx_hash = $1`,
    //     [tx.txid],
    //   )).rows[0];
    //   if (txPg === undefined) {
    //     let userId = (await pg.query(
    //       `select id from users where "addressBTC142" = $1`,
    //       [tx.address],
    //     )).rows[0];
    //     if (userId === undefined) {
    //       throw new Error(
    //         `recipient address ${tx.address} does not exist in db`,
    //       );
    //     }
    //     userId = userId.id;
    //     txPg = await pg.query(
    //       `
    //         insert into deposits (crypto, block_hash, tx_hash, recipient_addr, recipient_id, amount, status)
    //         values ('BTC', $1, $2, $3, $4, $5, 'created')
    //         returning *
    //       `,
    //       [tx.blockhash, tx.txid, tx.address, userId, tx.amount],
    //     );
    //     txPg = txPg.rows[0];
    //   }
    //   if (!confirmed && txPg.confirmed) {
    //     throw new Error(`tx ${tx.txid} attacked`);
    //   } else if (confirmed && !txPg.confirmed) {
    //     try {
    //       await pg.query(`begin`);
    //       await pg.query(
    //         `update deposits set status = 'finished' where crypto = 'BTC' and tx_hash = $1`,
    //         [tx.txid],
    //       );
    //       await pg.query(
    //         `update crypto_accounts set available = available + $1 where crypto = 'BTC' and user_id = $2`,
    //         [tx.amount, txPg.recipient_id],
    //       );
    //       await pg.query(`commit`);
    //     } catch (err) {
    //       await pg.query(`rollback`);
    //       throw err;
    //     }
    //   }
    // }
    // let cnt = 0;
    // while (cnt < txs.length && txs[cnt].confirmations >= confThreshold) {
    //   cnt++;
    // }
    // await pg.query(
    //   `update kv_pairs set "value" = $1 where "key" = 'btcCursor'`,
    //   [cursor + cnt],
    // );
  }

  @Configurable()
  @Cron('* */10 * * * *', { startTime: new Date() })
  public async withdrawalCron(
    @ConfigParam('btc.withdrawal.step') step: number,
  ) {
    while (true) {
      // TODO handle idempotency
      const lW = await this.withdrawals
        .createQueryBuilder()
        .where({
          cryptoSymbol: CryptoSymbol.BTC,
          status: WithdrawalStatus.created,
        })
        .orderBy('id')
        .limit(step)
        .getMany();
      if (lW.length === 0) {
        return;
      }
      // TODO handle fee
      const txHash = await this.rpc.sendMany('coinfair', {
        ...lW.map((d: { recipient: string; amount: string }) => ({
          [d.recipient]: d.amount,
        })),
      });
      await this.withdrawals.update(lW.map((w) => w.id), {
        status: WithdrawalStatus.finished,
        txHash,
      });
    }
  }

  private getAddrBip142(derivePath: string): string {
    const pub = this.pubNode.derivePath(derivePath);
    return BtcLib.address.fromOutputScript(
      BtcLib.script.scriptHash.output.encode(
        BtcLib.crypto.hash160(
          BtcLib.script.witnessPubKeyHash.output.encode(
            BtcLib.crypto.hash160(pub.publicKey),
          ),
        ),
      ),
    );
  }

  private getAddrBip173(derivePath: string): string {
    const pub = this.pubNode.derivePath(derivePath);
    return BtcLib.address.fromOutputScript(
      BtcLib.script.witnessPubKeyHash.output.encode(
        BtcLib.crypto.hash160(pub.publicKey),
      ),
    );
  }
}

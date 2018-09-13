import { InjectRepository } from '@nestjs/typeorm';
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import { hdkey } from 'ethereumjs-wallet';
import { Cron } from 'nest-schedule';
import { ConfigParam } from 'nestjs-config';
import { Repository } from 'typeorm';
import { CoinAgent } from '../utils/coin-agent';
import { CryptoSymbol } from '../utils/crypto-symbol.enum';
import { Crypto } from '../utils/crypto.entity';
import { Deposit } from '../utils/deposit.entity';
import { Withdrawal } from '../utils/withdrawal.entity';

export class EtherAgent extends CoinAgent {
  private crypto: Promise<Crypto>;
  private prvNode;
  private pubNode;
  private web3;

  constructor(
    @ConfigParam('crypto.bitcoinXPrv') xPrv: string,
    @ConfigParam('crypto.bitcoinXPub') xPub: string,
    @InjectRepository(Deposit) protected readonly deposits: Repository<Deposit>,
    @InjectRepository(Withdrawal)
    protected readonly withdrawals: Repository<Withdrawal>,
  ) {
    super();
    if (!xPrv.startsWith('xprv')) {
      throw Error();
    }
    if (!xPub.startsWith('xpub')) {
      throw Error();
    }
    this.crypto = Crypto.create({ symbol: CryptoSymbol.BTC }).save();
    this.prvNode = hdkey.fromExtendedKey(xPrv);
    this.pubNode = hdkey.fromExtendedKey(xPub);
  }

  public getPrivateKey(clientId: number, accountPath: string): string {
    const derivePath = clientId + '/' + accountPath;
    return this.prvNode
      .derivePath(derivePath)
      .getWallet()
      .getPrivateKeyString();
  }

  public getAddr(clientId: number, accountPath: string): string {
    return toChecksumAddress(
      this.pubNode
        .derivePath(clientId + '/' + accountPath)
        .getWallet()
        .getAddressString(),
    );
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

  // TODO
  public createWithdrawal(withdrawal: Withdrawal) {
    return;
  }

  // TODO
  @Cron('*/5 * * * * *', { startTime: new Date() })
  public depositCron() {
    return;
  }
}

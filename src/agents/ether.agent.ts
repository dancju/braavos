// tslint:disable:no-submodule-imports
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import {
  EthereumHDKey,
  fromExtendedKey,
  fromMasterSeed,
} from 'ethereumjs-wallet/hdkey';
import { Cron } from 'nest-schedule';
import { ConfigParam, ConfigService, InjectConfig } from 'nestjs-config';
import { Repository } from 'typeorm';
import Web3 from 'web3';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';

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
    return toChecksumAddress(
      this.pubNode
        .derivePath(path1)
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
  public async createWithdrawal(withdrawal: Withdrawal) {
    return;
  }

  // TODO
  @Cron('* */10 * * * *', { startTime: new Date() })
  public refreshFee(): Promise<void> {
    return;
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public collectCron(): Promise<void> {
    return;
  }

  // TODO
  @Cron('* */1 * * * *', { startTime: new Date() })
  public depositCron(): Promise<void> {
    return;
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

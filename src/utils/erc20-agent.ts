// tslint:disable:no-submodule-imports
import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Cron } from 'nest-schedule';
import { ConfigParam, ConfigService, InjectConfig } from 'nestjs-config';
import Web3 from 'web3';
import { EtherAgent } from '../agents/ether.agent';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { Chain } from '../utils/chain.enum';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';

const { ETH } = CoinSymbol;
const { ethereum } = Chain;

@Injectable()
export abstract class Erc20Agent extends CoinAgent {
  protected readonly coin: Promise<Coin>;
  private readonly web3: Web3;
  private readonly etherAgent: EtherAgent;

  constructor(
    @InjectConfig() config: ConfigService,
    @Inject(Web3) web3: Web3,
    @Inject(EtherAgent) etherAgent: EtherAgent,
    coinSymbol: CoinSymbol,
  ) {
    super();
    this.web3 = web3;
    this.etherAgent = etherAgent;
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
        res.info = { cursor: 0 };
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
  public createWithdrawal(withdrawal: Withdrawal): Promise<void> {
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
    throw new NotImplementedException();
  }
}

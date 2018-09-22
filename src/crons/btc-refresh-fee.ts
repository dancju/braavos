import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import { CoinEnum } from '../coins';
import { Coin } from '../entities/coin.entity';

const { BTC } = CoinEnum;

@Injectable()
export class BtcRefreshFee extends NestSchedule {
  private readonly rpc: BtcRpc;
  private readonly confTarget: number;
  private readonly txSizeKb: number;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(BtcRpc) rpc: BtcRpc,
  ) {
    super();
    this.confTarget = config.get('bitcoin.btc.fee').confTarget;
    this.txSizeKb = config.get('bitcoin.btc.fee').txSizeKb;
    this.rpc = rpc;
    if (
      typeof this.confTarget !== 'number' ||
      typeof this.txSizeKb !== 'number'
    ) {
      throw new Error();
    }
    this.cron();
  }

  @Cron('*/10 * * * *', { startTime: new Date() })
  public async cron(): Promise<void> {
    const feeRate = (await this.rpc.estimateSmartFee(this.confTarget)).feerate;
    if (!feeRate || feeRate === -1) {
      // TODO logger.warn
      return;
    }
    const fee = this.txSizeKb * feeRate;
    await Promise.all([
      this.rpc.setTxFee(feeRate),
      Coin.update({ symbol: BTC }, { withdrawalFeeAmount: fee }),
    ]);
  }
}

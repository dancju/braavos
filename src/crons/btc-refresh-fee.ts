import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigParam, Configurable } from 'nestjs-config';
import { CoinEnum } from '../coins';
import { Coin } from '../entities/coin.entity';

const { BTC } = CoinEnum;

@Injectable()
export class BtcRefreshFee extends NestSchedule {
  private readonly rpc: BtcRpc;

  constructor(@Inject(BtcRpc) rpc: BtcRpc) {
    super();
    this.rpc = rpc;
  }

  @Configurable()
  @Cron('*/10 * * * *', { startTime: new Date() })
  public async refreshFee(
    @ConfigParam('bitcoin.btc.fee.confTarget') confTarget: number,
    @ConfigParam('bitcoin.btc.fee.txSizeKb') txSizeKb: number,
  ): Promise<void> {
    const feeRate = (await this.rpc.estimateSmartFee(confTarget)).feerate;
    if (!feeRate) {
      return;
    }
    const fee = txSizeKb * feeRate;
    await Promise.all([
      this.rpc.setTxFee(feeRate),
      Coin.update({ symbol: BTC }, { withdrawalFeeAmount: fee }),
    ]);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigParam, Configurable } from 'nestjs-config';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';

const { BTC } = CoinEnum;
const { bitcoin } = ChainEnum;

@Injectable()
export class BtcCreateDeposit extends NestSchedule {
  private readonly rpc: BtcRpc;
  private readonly amqpService: AmqpService;

  constructor(rpc: BtcRpc, amqpService: AmqpService) {
    super();
    this.rpc = rpc;
    this.amqpService = amqpService;
  }

  @Configurable()
  @Cron('*/1 * * * *', { startTime: new Date() })
  public async cron(
    @ConfigParam('bitcoin.btc.deposit.step') step: number,
  ): Promise<void> {
    const coin = await Coin.createQueryBuilder()
      .where({ symbol: BTC })
      .setLock('pessimistic_write')
      .getOne();
    if (!coin) {
      throw new Error();
    }
    while (true) {
      const txs = await this.rpc.listTransactions(
        'braavos',
        step,
        coin.info.depositCursor,
      );
      if (txs.length === 0) {
        break;
      }
      for (const tx of txs.filter((t) => t.category === 'receive')) {
        if (await Deposit.findOne({ coinSymbol: BTC, txHash: tx.txid })) {
          continue;
        }
        const addr = await Addr.findOne({
          addr: tx.address,
          chain: bitcoin,
        });
        if (addr) {
          const deposit = await Deposit.create({
            addrPath: addr.path,
            amount: String(tx.amount),
            clientId: addr.clientId,
            coinSymbol: BTC,
            txHash: tx.txid,
          }).save();
          await this.amqpService.createDeposit(deposit);
        }
      }
      coin.info.depositCursor += txs.length;
    }
    await coin.save();
  }
}

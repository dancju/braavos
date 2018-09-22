import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigParam, ConfigService, Configurable } from 'nestjs-config';
import { getManager } from 'typeorm';
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
  private readonly step: number;

  constructor(rpc: BtcRpc, amqpService: AmqpService, config: ConfigService) {
    super();
    this.rpc = rpc;
    this.amqpService = amqpService;
    this.step = config.get('bitcoin.btc.deposit.step');
    if (typeof this.step !== 'number') {
      throw new Error();
    }
    this.cron();
  }

  @Cron('*/1 * * * *', { startTime: new Date() })
  public async cron(): Promise<void> {
    await getManager().transaction(async (manager) => {
      const coin = await manager
        .createQueryBuilder(Coin, 'c')
        .where({ symbol: BTC })
        .setLock('pessimistic_write')
        .getOne();
      if (!coin) {
        throw new Error();
      }
      while (true) {
        const txs = await this.rpc.listTransactions(
          'braavos',
          this.step,
          coin.info.depositCursor,
        );
        console.log(txs);
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
      await manager.update(Coin, BTC, { info: coin.info });
    });
  }
}

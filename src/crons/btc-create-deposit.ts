import { Injectable } from '@nestjs/common';
import BtcRpc, { ListTransactionsResult } from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
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
  private readonly amqpService: AmqpService;
  private readonly rpc: BtcRpc;

  constructor(amqpService: AmqpService, rpc: BtcRpc) {
    super();
    this.amqpService = amqpService;
    this.rpc = rpc;
  }

  // TODO Lock depositMilestone
  @Cron('*/1 * * * *', { startTime: new Date() })
  public async cron(): Promise<void> {
    const lastMilestone = (await Coin.findOne(BTC))!.info
      .depositMilestone as string;
    const nextMilestone = (await this.rpc.listTransactions('*', 1, 0))[0].txid;
    let cursor = 0;
    while (true) {
      const txs = (await this.rpc.listTransactions('*', 64, cursor)).reverse();
      if (await this.bazainga(txs, lastMilestone)) {
        break;
      }
      cursor += txs.length;
    }
    await getManager().query(`
      update coin
      set
        info =
          info ||
          ('{ "depositMilestone":' || '"${nextMilestone}"' || ' }')::jsonb
      where symbol = 'BTC'
    `);
  }

  private async bazainga(
    txs: ListTransactionsResult[],
    lastMilestone: string,
  ): Promise<boolean> {
    if (txs.length === 0) {
      return true;
    }
    for (const tx of txs) {
      if (tx.txid === lastMilestone) {
        return true;
      }
      if (tx.category !== 'receive') {
        continue;
      }
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
    return false;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { Cron, NestSchedule } from 'nest-schedule';
import {
  ConfigParam,
  ConfigService,
  Configurable,
  InjectConfig,
} from 'nestjs-config';
import {
  AdvancedConsoleLogger,
  EntityManager,
  getManager,
  Repository,
  Transaction,
  TransactionManager,
} from 'typeorm';
import Web3 from 'web3';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum, EthereumService } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';

const { ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class EthConfirm extends NestSchedule {
  private readonly web3: Web3;
  private readonly config: ConfigService;
  private readonly amqpService: AmqpService;
  private ethereumService: EthereumService;

  constructor(
    config: ConfigService,
    web3: Web3,
    amqpService: AmqpService,
    ethereumService: EthereumService,
  ) {
    super();
    this.config = config;
    this.web3 = web3;
    this.amqpService = amqpService;
    this.ethereumService = ethereumService;
  }

  @Configurable()
  @Cron('*/10 * * * * *', { startTime: new Date() })
  public async confirmCron(): Promise<void> {
    if (this.ethereumService.cronLock.confirmCron === true) {
      console.log('last confirmCron still in handling');
      return;
    }
    try {
      this.ethereumService.cronLock.confirmCron = true;
      const confThreshold: number = this.config.get(
        'ethereum.ether.collect.confThreshold',
      );
      const uu = await Deposit.createQueryBuilder()
        .select()
        .where({ coinSymbol: ETH, status: DepositStatus.unconfirmed })
        .orderBy('id')
        .getMany();
      if (uu.length <= 0) {
        this.ethereumService.cronLock.confirmCron = false;
        return;
      }
      const height = await this.web3.eth.getBlockNumber();
      await Promise.all(
        uu.map(async (tx: Deposit) => {
          const blockHeight = tx.info.blockHeight;
          if (height - blockHeight < confThreshold) {
            return;
          }
          const acc = await Account.createQueryBuilder()
            .select()
            .where({ clientId: tx.clientId, coinSymbol: ETH })
            .getOne();
          if (!acc) {
            console.log(`don't have this account`);
            // logger.error('no have this client');
            return;
          }
          await getManager().transaction(async (manager) => {
            await manager
              .createQueryBuilder()
              .update(Deposit)
              .set({ status: DepositStatus.confirmed })
              .where({ id: tx.id })
              .execute();
            await manager
              .createQueryBuilder(Account, 'account')
              .where({ clientId: tx.clientId, coinSymbol: ETH })
              .setLock('pessimistic_write')
              .getOne();
            await manager.increment(
              Account,
              { clientId: tx.clientId, coinSymbol: ETH },
              'balance',
              Number(tx.amount),
            );
            const d = await Deposit.findOne({id: tx.id});
            if (d) {
              await this.amqpService.updateDeposit(d);
            }
            console.log(`confirm tx: ${tx.id}`);
          });
        }),
      );
      this.ethereumService.cronLock.confirmCron = false;
    } catch (err) {
      console.log(err);
      this.ethereumService.cronLock.confirmCron = false;
    }
  }
}

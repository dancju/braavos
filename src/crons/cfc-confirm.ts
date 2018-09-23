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
import { CfcService, CoinEnum } from '../coins';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Erc20Confirm } from './erc20-confirm';

const { ETH, CFC } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class CfcConfirm extends Erc20Confirm {
  constructor(
    config: ConfigService,
    web3: Web3,
    amqpService: AmqpService,
    cfcService: CfcService,
  ) {
    super(config, web3, amqpService, CFC, cfcService);
  }
}

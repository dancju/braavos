import { Injectable } from '@nestjs/common';
import bunyan from 'bunyan';
import { ConfigService } from 'nestjs-config';
import Web3 from 'web3';
import { AmqpService } from '../amqp/amqp.service';
import { CfcService, CoinEnum } from '../coins';
import { Erc20Collect } from './erc20-collect';

const { CFC } = CoinEnum;

@Injectable()
export class CfcCollect extends Erc20Collect {
  constructor(
    config: ConfigService,
    logger: bunyan,
    web3: Web3,
    amqpService: AmqpService,
    cfcService: CfcService,
  ) {
    super(config, logger, amqpService, web3, CFC, cfcService);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import fs from 'fs';
import { ConfigService, InjectConfig } from 'nestjs-config';
import path from 'path';
import { Repository } from 'typeorm';
import Web3 from 'web3';
import { AmqpService } from '../../amqp/amqp.service';
import { CoinEnum } from '../../coins';
import { Coin } from '../../entities/coin.entity';
import { Erc20Service } from '../erc20.service';

const { CFC } = CoinEnum;

@Injectable()
export class CfcAgent extends Erc20Service {
  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
    @Inject(Web3) web3: Web3,
    amqpService: AmqpService,
  ) {
    const abi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `./abi.json`), 'utf8'),
    );
    super(config, web3, CFC, abi, amqpService);
  }
}

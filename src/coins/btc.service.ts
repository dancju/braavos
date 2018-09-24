import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BtcRpc from 'bitcoin-core';
import { ConfigService, InjectConfig } from 'nestjs-config';
import { Repository } from 'typeorm';
import { BitcoinService } from '../chains';
import { Coin } from '../entities/coin.entity';

@Injectable()
export class BtcService extends BitcoinService implements ICoinService {
  constructor(
    @InjectConfig() config: ConfigService,
    @Inject(BtcRpc) rpc: BtcRpc,
    @InjectRepository(Coin) coinRepo: Repository<Coin>,
  ) {
    super(config, rpc);
  }
}

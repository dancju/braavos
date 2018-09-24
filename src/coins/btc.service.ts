import { Inject, Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { ConfigService, InjectConfig } from 'nestjs-config';
import { BitcoinService } from '../chains';

@Injectable()
export class BtcService extends BitcoinService implements ICoinService {
  constructor(
    @InjectConfig() config: ConfigService,
    @Inject(BtcRpc) rpc: BtcRpc,
  ) {
    super(config, rpc);
  }
}

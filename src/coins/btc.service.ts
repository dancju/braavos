import { Injectable } from '@nestjs/common';
import BtcRpc from 'bitcoin-core';
import { ConfigService } from 'nestjs-config';
import { BitcoinService } from '../chains';

@Injectable()
export class BtcService extends BitcoinService implements ICoinService {
  constructor(config: ConfigService, rpc: BtcRpc) {
    super(config, rpc);
  }
}

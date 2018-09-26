import { Injectable } from '@nestjs/common';
import fs from 'fs';
import { ConfigService } from 'nestjs-config';
import path from 'path';
import { EthereumService } from '../../chains/ethereum.service';

@Injectable()
export class CfcService extends EthereumService {
  public abi: object;
  constructor(config: ConfigService) {
    super(config);
    this.abi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `./abi.json`), 'utf8'),
    );
  }
}

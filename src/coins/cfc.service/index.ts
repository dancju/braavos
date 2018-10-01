import { Inject, Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { EthereumService } from '../../chains/ethereum.service';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class CfcService extends EthereumService {
  public abi: object;
  constructor(@Inject('ConfigService') config: ConfigService) {
    super(config);
    this.abi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `./abi.json`), 'utf8'),
    );
  }
}

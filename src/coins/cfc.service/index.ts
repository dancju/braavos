import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import fs from 'fs';
import { ConfigService, InjectConfig } from 'nestjs-config';
import path from 'path';
import { EthereumService } from '../../chains/ethereum.service';

@Injectable()
export class CfcService extends EthereumService {
  public abi: any;
  constructor(@InjectConfig() config: ConfigService) {
    const abi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `./abi.json`), 'utf8'),
    );
    super(config);
    this.abi = abi;
  }
}

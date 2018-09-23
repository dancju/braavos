import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import fs from 'fs';
import { ConfigService, InjectConfig } from 'nestjs-config';
import path from 'path';
import { Repository } from 'typeorm';
import Web3 from 'web3';
import { AmqpService } from '../../amqp/amqp.service';
import { ChainEnum } from '../../chains/chain.enum';
import { EthereumService } from '../../chains/ethereum.service';
import { CoinEnum } from '../../coins';
import { Coin } from '../../entities/coin.entity';

const { CFC, ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export class CfcService extends EthereumService {
  public abi: any;
  constructor(
    @InjectConfig() config: ConfigService,
    @InjectRepository(Coin) coins: Repository<Coin>,
    // @Inject(Web3) web3: Web3,
    // amqpService: AmqpService,
  ) {
    const abi = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `./abi.json`), 'utf8'),
    );
    super(config);
    this.abi = abi;
    try {
      (async () => {
        let res = await Coin.findOne(CFC);
        if (!res) {
          res = await Coin.create({
            chain: ethereum,
            depositFeeAmount: 0,
            depositFeeSymbol: ETH,
            symbol: CFC,
            withdrawalFeeAmount: 0,
            withdrawalFeeSymbol: ETH,
          });
          res.info = { cursor: 0, fee: 0 };
          await res.save();
        }
      })();
    } catch (err) {
      console.log(err);
    }
  }
}

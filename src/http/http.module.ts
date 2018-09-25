import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import BtcRpc from 'bitcoin-core';
import { ConfigModule, ConfigService } from 'nestjs-config';
import { BtcService, CfcService, CoinEnum, EthService } from '../coins';
import { Coin } from '../entities/coin.entity';
import { HttpController } from './http.controller';
import { SignatureStrategy } from './signature.strategy';

@Module({
  controllers: [HttpController],
  imports: [
    ConfigModule.load(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        ...config.get('pg'),
        bigNumberStrings: true,
        supportBigNumbers: true,
      }),
    }),
    TypeOrmModule.forFeature([Coin]),
  ],
  providers: [
    SignatureStrategy,
    {
      inject: [ConfigService],
      provide: BtcRpc,
      useFactory: (config: ConfigService) =>
        new BtcRpc(config.get('bitcoin.rpc')),
    },
    BtcService,
    EthService,
    CfcService,
    {
      inject: [BtcService, EthService, CfcService],
      provide: 'CoinServiceRepo',
      useFactory: (
        btcService: BtcService,
        ethService: EthService,
        cfcService: CfcService,
      ) => ({
        [CoinEnum.BTC]: btcService,
        [CoinEnum.ETH]: ethService,
        [CoinEnum.CFC]: cfcService,
      }),
    },
  ],
})
export class HttpModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import BtcRpc from 'bitcoin-core';
import { ConfigModule, ConfigService } from 'nestjs-config';
import { BtcService, CoinEnum } from '../coins';
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
        entities: [__dirname + '/../**/*.entity.ts'],
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
    {
      inject: [BtcService],
      provide: 'CoinServiceRepo',
      useFactory: (btcService: BtcService) => ({ [CoinEnum.BTC]: btcService }),
    },
  ],
})
export class HttpModule {}

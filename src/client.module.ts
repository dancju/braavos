import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import BtcRpc from 'bitcoin-core';
import { ConfigModule, ConfigService } from 'nestjs-config';
import Web3 from 'web3';
import { BitcoinAgent } from './agents/bitcoin.agent';
import { EtherAgent } from './agents/ether.agent';
import { ClientController } from './client/client.controller';
import { HttpStrategy } from './client/http.strategy';
import { Coin } from './entities/coin.entity';

@Module({
  controllers: [ClientController],
  imports: [
    ConfigModule.load(),
    PassportModule.register({ defaultStrategy: 'bearer' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        ...config.get('pg'),
        bigNumberStrings: true,
        entities: [__dirname + '/../**/*.entity.ts'],
        supportBigNumbers: true,
        synchronize: true,
        type: 'postgres',
      }),
    }),
    TypeOrmModule.forFeature([Coin]),
  ],
  providers: [
    HttpStrategy,
    BitcoinAgent,
    EtherAgent,
    {
      inject: [ConfigService],
      provide: BtcRpc,
      useFactory: (config: ConfigService) => {
        return new BtcRpc(config.get('bitcoin.rpc'));
      },
    },
    {
      inject: [ConfigService],
      provide: Web3,
      useFactory: (config: ConfigService) => {
        return new Web3.providers.HttpProvider(config.get('ethereum.web3'));
      },
    },
  ],
})
export class ClientModule {}

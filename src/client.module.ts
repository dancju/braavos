import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import amqp from 'amqplib';
import BtcRpc from 'bitcoin-core';
import { AmqpModule } from 'nestjs-amqp';
import { ConfigModule, ConfigService } from 'nestjs-config';
import Web3 from 'web3';
import { BitcoinAgent } from './agents/bitcoin.agent';
import { CfcAgent } from './agents/cfc.agent';
import { EtherAgent } from './agents/ether.agent';
import { AmqpService } from './client/amqp.service';
import { ClientController } from './client/http.controller';
import { SignatureStrategy } from './client/signature.strategy';
import { Coin } from './entities/coin.entity';
import { CoinSymbol } from './utils/coin-symbol.enum';

@Module({
  controllers: [ClientController],
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
    AmqpModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('amqp'),
    }),
  ],
  providers: [
    SignatureStrategy,
    {
      inject: [ConfigService],
      provide: BtcRpc,
      useFactory: (config: ConfigService) => {
        // TODO test connection
        return new BtcRpc(config.get('bitcoin.rpc'));
      },
    },
    {
      inject: [ConfigService],
      provide: Web3,
      useFactory: (config: ConfigService) => {
        // TODO test connection
        return new Web3.providers.HttpProvider(config.get('ethereum.web3'));
      },
    },
    AmqpService,
    {
      inject: [BitcoinAgent, EtherAgent, CfcAgent],
      provide: 'coin-agent-repo',
      useFactory: (
        bitcoinAgent: BitcoinAgent,
        etherAgent: EtherAgent,
        cfcAgent: CfcAgent,
      ) => ({
        [CoinSymbol.BTC]: bitcoinAgent,
        [CoinSymbol.ETH]: etherAgent,
        [CoinSymbol.CFC]: cfcAgent,
      }),
    },
    BitcoinAgent,
    EtherAgent,
    CfcAgent,
  ],
})
export class ClientModule {}

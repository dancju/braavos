import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import amqp from 'amqplib';
import BtcRpc from 'bitcoin-core';
import { ConfigModule, ConfigService } from 'nestjs-config';
import Web3 from 'web3';
import { BitcoinAgent } from './agents/bitcoin.agent';
import { CfcAgent } from './agents/cfc.agent';
import { EtherAgent } from './agents/ether.agent';
import { AmqpService } from './amqp/amqp.service';
import { ClientController } from './client/client.controller';
import { SignatureStrategy } from './client/signature.strategy';
import { Coin } from './entities/coin.entity';

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
  ],
  providers: [
    SignatureStrategy,
    {
      inject: [ConfigService],
      provide: 'amqp-connection',
      useFactory: async (config: ConfigService) =>
        amqp.connect(config.get('amqp')),
    },
    // TODO add agentRepo provider
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
    BitcoinAgent,
    EtherAgent,
    CfcAgent,
  ],
})
export class ClientModule {}

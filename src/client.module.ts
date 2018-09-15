import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from 'nestjs-config';
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
  providers: [HttpStrategy, BitcoinAgent, EtherAgent],
})
export class ClientModule {}

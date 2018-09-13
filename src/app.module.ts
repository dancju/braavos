import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from 'nestjs-config';
import { AppController } from './app.controller';
import { BitcoinAgent } from './bitcoin/bitcoin.agent';
import { HttpStrategy } from './client/http.strategy';
import { EtherAgent } from './ether/ether.agent';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.load(),
    PassportModule.register({ defaultStrategy: 'bearer' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.load()],
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
  ],
  providers: [HttpStrategy, BitcoinAgent, EtherAgent],
})
export class AppModule {}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Matches } from 'class-validator';
import { Repository } from 'typeorm';
import { BitcoinAgent } from './bitcoin/bitcoin.agent';
import { DClient } from './client/client.decorator';
import { Client } from './client/client.entity';
import { EtherAgent } from './ether/ether.agent';
import { CoinAgent } from './utils/coin-agent';
import { CreateWithdrawalDto } from './utils/create-withdrawal.dto';
import { CryptoSymbol } from './utils/crypto-symbol.enum';
import { Deposit } from './utils/deposit.entity';
import { Withdrawal } from './utils/withdrawal.entity';

@ApiBearerAuth()
@Controller()
@Injectable()
@UseGuards(AuthGuard())
export class AppController {
  private coinAgents: { [k in CryptoSymbol]: CoinAgent };

  constructor(
    @InjectRepository(Deposit) private readonly deposits: Repository<Deposit>,
    @InjectRepository(Withdrawal)
    private readonly withdrawals: Repository<Withdrawal>,
    bitcoinAgent: BitcoinAgent,
    etherAgent: EtherAgent,
  ) {
    this.coinAgents[CryptoSymbol.BTC] = bitcoinAgent;
    this.coinAgents[CryptoSymbol.ETH] = etherAgent;
  }

  @Get('addrs')
  @ApiOkResponse({ type: String })
  @ApiCreatedResponse({ type: String })
  @UsePipes(ValidationPipe)
  public async findAddr(
    @DClient() client: Client,
    @Query('cryptoSymbol') cryptoSymbol: CryptoSymbol,
    @Matches(/\d(\/\d+)*/i)
    @Query('accountId')
    accountId: string,
  ): Promise<string> {
    return;
  }

  @Get('deposits')
  @ApiOkResponse({ type: [Deposit] })
  @UsePipes(ValidationPipe)
  public async findDeposits(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Deposit[]> {
    return;
  }

  @Get('withdrawals')
  @ApiOkResponse({ type: [Withdrawal] })
  @UsePipes(ValidationPipe)
  public async findWithdrawals(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Withdrawal[]> {
    return;
  }

  @Put('withdrawals')
  @ApiCreatedResponse({ type: Withdrawal })
  @ApiConflictResponse({ description: '幂等性冲突' })
  @ApiBadRequestResponse({})
  @UsePipes(ValidationPipe)
  public async createWithdrawal(
    @DClient() client: Client,
    @Body() body: CreateWithdrawalDto,
  ): Promise<Withdrawal> {
    // TODO lock table
    const { cryptoSymbol, recipient } = body;
    if (
      await this.withdrawals.findOne({
        clientId: client.id,
        key: body.key,
      })
    ) {
      throw new ConflictException();
    }
    if (!this.coinAgents[cryptoSymbol].isValidAddress(recipient)) {
      throw new BadRequestException();
    }
    const w = await this.withdrawals
      .create({
        amount: body.amount,
        clientId: client.id,
        cryptoSymbol,
        recipient,
      })
      .save();
    this.coinAgents[cryptoSymbol].createWithdrawal(w);
    return;
  }

  @Get('cryptos')
  @ApiOkResponse({})
  @UsePipes(ValidationPipe)
  public async getCryptos(@Query('cryptoSymbol') cryptoSymbol: CryptoSymbol) {
    return;
  }
}

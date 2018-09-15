import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Post,
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
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { BitcoinAgent } from '../agents/bitcoin.agent';
import { EtherAgent } from '../agents/ether.agent';
import { Client } from '../entities/client.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { CoinAgent } from '../utils/coin-agent';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { DClient } from './client.decorator';
import { CreateWithdrawalDto } from './create-withdrawal.dto';

@ApiBearerAuth()
@Controller()
@Injectable()
@UseGuards(AuthGuard())
export class ClientController {
  private coinAgents: { [k in CoinSymbol]?: CoinAgent };

  constructor(bitcoinAgent: BitcoinAgent, etherAgent: EtherAgent) {
    this.coinAgents = {
      [CoinSymbol.BTC]: bitcoinAgent,
      [CoinSymbol.ETH]: etherAgent,
    };
  }

  @Get('addrs')
  @ApiOkResponse({ type: String })
  @ApiCreatedResponse({ type: String })
  @UsePipes(ValidationPipe)
  public async findAddr(
    @DClient() client: Client,
    @Query('coinSymbol') coinSymbol: CoinSymbol,
    @Matches(/\d(\/\d+)*/i)
    @Query('accountId')
    path: string,
  ): Promise<string> {
    return this.coinAgents[coinSymbol].getAddr(client.id, path);
  }

  @Get('deposits')
  @ApiOkResponse({ type: [Deposit] })
  @UsePipes(ValidationPipe)
  public async findDeposits(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Deposit[]> {
    return Deposit.createQueryBuilder()
      .where({ clientId: client.id })
      .orderBy('id')
      .offset(offset)
      .limit(limit)
      .getMany();
  }

  @Get('withdrawals')
  @ApiOkResponse({ type: [Withdrawal] })
  @UsePipes(ValidationPipe)
  public async findWithdrawals(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Withdrawal[]> {
    return Withdrawal.createQueryBuilder()
      .where({ clientId: client.id })
      .orderBy('id')
      .offset(offset)
      .limit(limit)
      .getMany();
  }

  @Post('withdrawals')
  @ApiCreatedResponse({ type: Withdrawal })
  @ApiConflictResponse({ description: '幂等性冲突' })
  @ApiBadRequestResponse({ description: '请求错误' })
  @UsePipes(ValidationPipe)
  public async createWithdrawal(
    @DClient() client: Client,
    @Body() body: CreateWithdrawalDto,
  ): Promise<Withdrawal> {
    const { coinSymbol, recipient } = body;
    if (
      await Withdrawal.findOne({
        clientId: client.id,
        key: body.key,
      })
    ) {
      throw new ConflictException();
    }
    if (!this.coinAgents[coinSymbol].isValidAddress(recipient)) {
      throw new BadRequestException();
    }
    const w = await Withdrawal.create({
      amount: body.amount,
      clientId: client.id,
      coinSymbol,
      key: body.key,
      recipient,
    }).save();
    this.coinAgents[coinSymbol].createWithdrawal(w);
    return;
  }

  @Get('coins')
  @ApiOkResponse({})
  @ApiNotFoundResponse({ description: '货币符号不存在' })
  @UsePipes(ValidationPipe)
  public async getCoins(@Query('coinSymbol') coinSymbol: CoinSymbol) {
    const coin = await Coin.findOne(coinSymbol);
    if (!coin) {
      throw new NotFoundException();
    }
    return coin;
  }
}

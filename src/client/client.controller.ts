import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  Injectable,
  NotFoundException,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiImplicitQuery,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { BitcoinAgent } from '../agents/bitcoin.agent';
import { CfcAgent } from '../agents/cfc.agent';
import { EtherAgent } from '../agents/ether.agent';
import { Account } from '../entities/account.entity';
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

  constructor(
    bitcoinAgent: BitcoinAgent,
    etherAgent: EtherAgent,
    cfcAgent: CfcAgent,
  ) {
    this.coinAgents = {
      [CoinSymbol.BTC]: bitcoinAgent,
      [CoinSymbol.ETH]: etherAgent,
      [CoinSymbol.CFC]: cfcAgent,
    };
  }

  @Get('addrs')
  @ApiImplicitQuery({
    description: '数字货币符号',
    enum: Object.keys(CoinSymbol),
    name: 'coinSymbol',
    type: 'string',
  })
  @ApiImplicitQuery({
    description:
      '地址路径，由数字和斜杠组成且斜杠不能连续出现，通常使用终端用户的数字标识符即可',
    name: 'path',
  })
  @ApiOkResponse({ type: String })
  public findAddr(
    @DClient() client: Client,
    @Query('coinSymbol') coinSymbol: CoinSymbol,
    @Matches(/^\d+(\/\d+)*$/)
    @Query('path')
    path: string,
  ): Promise<string> {
    return this.coinAgents[coinSymbol].getAddr(client.id, path);
  }

  @Get('deposits')
  @ApiOkResponse({ type: [Deposit] })
  public findDeposits(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Deposit[]> {
    return Deposit.createQueryBuilder()
      .where({ clientId: client.id })
      .orderBy('id')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  @Get('withdrawals')
  @ApiOkResponse({ type: [Withdrawal] })
  public findWithdrawals(
    @DClient() client: Client,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
  ): Promise<Withdrawal[]> {
    return Withdrawal.createQueryBuilder()
      .where({ clientId: client.id })
      .orderBy('id')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  @Put('withdrawals')
  @ApiCreatedResponse({ type: Withdrawal })
  @ApiBadRequestResponse({ description: '请求格式错误' })
  @ApiConflictResponse({ description: '幂等性冲突' })
  @ApiResponse({ description: '客户端余额不足', status: 402 })
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
    if (
      Number(
        (await Account.findOne({
          clientId: client.id,
          coinSymbol: body.coinSymbol,
        })).balance,
      ) <= 0
    ) {
      throw new HttpException('Payment Required', 402);
    }
    await this.coinAgents[coinSymbol].createWithdrawal(
      await Withdrawal.create({
        amount: body.amount,
        clientId: client.id,
        coinSymbol,
        key: body.key,
        recipient,
      }).save(),
    );
    return;
  }

  @Get('coins')
  @ApiImplicitQuery({
    description: '数字货币符号',
    enum: Object.keys(CoinSymbol),
    name: 'coinSymbol',
    type: 'string',
  })
  @ApiOkResponse({ description: '数字货币详情', type: Coin })
  @ApiNotFoundResponse({ description: '货币符号不存在' })
  public async getCoins(@Query('coinSymbol') coinSymbol: CoinSymbol) {
    const coin = await Coin.findOne(coinSymbol);
    if (!coin) {
      throw new NotFoundException();
    }
    return coin;
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
import { getManager } from 'typeorm';
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
import { SignatureGuard } from './signature.guard';

// TODO add param-scoped pipes

@ApiBearerAuth()
@Controller()
@Injectable()
@UseGuards(SignatureGuard)
@UsePipes(ValidationPipe)
export class ClientController {
  private readonly coinAgents: { [k in CoinSymbol]?: CoinAgent };

  constructor(
    @Inject('coin-agent-repo') coinAgents: { [k in CoinSymbol]?: CoinAgent },
  ) {
    this.coinAgents = coinAgents;
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
    const agent = this.coinAgents[coinSymbol];
    if (!agent) {
      throw new Error();
    }
    return agent.getAddr(client.id, path);
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

  // @Put('withdrawals')
  // @ApiCreatedResponse({ type: Withdrawal })
  // @ApiBadRequestResponse({ description: '请求格式错误' })
  // @ApiConflictResponse({ description: '幂等性冲突' })
  // @ApiResponse({ description: '客户余额不足', status: 402 })
  // public async createWithdrawal(
  //   @DClient() client: Client,
  //   @Body() body: CreateWithdrawalDto,
  // ): Promise<Withdrawal> {
  //   const { coinSymbol, recipient } = body;
  //   if (
  //     await Withdrawal.findOne({
  //       clientId: client.id,
  //       key: body.key,
  //     })
  //   ) {
  //     throw new ConflictException();
  //   }
  //   const agent = this.coinAgents[coinSymbol];
  //   if (!agent) {
  //     throw new Error();
  //   }
  //   if (!agent.isValidAddress(recipient)) {
  //     throw new BadRequestException('Bad Recipient');
  //   }
  //   await Account.createQueryBuilder()
  //     .insert()
  //     .values({ clientId: client.id, coinSymbol })
  //     .onConflict('("clientId", "coinSymbol") DO NOTHING')
  //     .execute();
  //   await getManager().transaction(async (manager) => {
  //     const account = await manager
  //       .createQueryBuilder(Account, 'account')
  //       .where({ clientId: client.id, coinSymbol: body.coinSymbol })
  //       .setLock('pessimistic_write')
  //       .getOne();
  //     if (!account) {
  //       throw new Error();
  //     }
  //     if (Number(account.balance) < Number(body.amount)) {
  //       throw new HttpException('Payment Required', 402);
  //     }
  //     await manager.decrement(
  //       Account,
  //       { clientId: client.id, coinSymbol: body.coinSymbol },
  //       'balance',
  //       Number(body.amount),
  //     );
  //     await manager
  //       .createQueryBuilder()
  //       .insert()
  //       .into(Withdrawal)
  //       .values({
  //         amount: body.amount,
  //         clientId: client.id,
  //         coinSymbol,
  //         key: body.key,
  //         memo: body.memo,
  //         recipient,
  //       })
  //       .execute();
  //   });
  //   const res = (await Withdrawal.findOne({
  //     clientId: client.id,
  //     key: body.key,
  //   }))!;
  //   await agent.createWithdrawal(res);
  //   return res;
  // }

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

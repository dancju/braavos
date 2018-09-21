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
import { Channel, Connection } from 'amqplib';
import { Matches } from 'class-validator';
import { getManager } from 'typeorm';
import { CoinAgent } from '../agents/coin.agent';
import { Account } from '../entities/account.entity';
import { Client } from '../entities/client.entity';
import { Coin } from '../entities/coin.entity';
import { Deposit } from '../entities/deposit.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { CoinSymbol } from '../utils/coin-symbol.enum';
import { AmqpService } from './amqp.service';
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
    amqp: AmqpService,
    @Inject('coin-agent-repo') coinAgents: { [k in CoinSymbol]?: CoinAgent },
  ) {
    this.coinAgents = coinAgents;
    this.createWithdrawal(amqp);
  }

  public async createWithdrawal(amqp: AmqpService) {
    const channel = await amqp.connection.createChannel();
    const queue = 'withdrawal_creation';
    channel.assertQueue(queue);
    channel.consume(queue, async (msg) => {
      if (!msg) {
        return;
      }
      const body = JSON.parse(msg.content.toString());
      console.log('======================' + Object.keys(body));
      // TODO handle amqp auth
      // TODO handle body validation
      const clientId = 1;
      if (
        await Withdrawal.findOne({
          clientId,
          key: body.key,
        })
      ) {
        channel.ack(msg);
        return;
      }
      const agent = this.coinAgents[body.coinSymbol];
      if (!agent) {
        channel.nack(msg, false, false);
      }
      if (!agent.isValidAddress(body.recipient)) {
        // throw new Error('Bad Recipient');
        channel.nack(msg, false, false);
        return;
      }
      await Account.createQueryBuilder()
        .insert()
        .values({ clientId, coinSymbol: body.coinSymbol })
        .onConflict('("clientId", "coinSymbol") DO NOTHING')
        .execute();
      await getManager().transaction(async (manager) => {
        const account = await manager
          .createQueryBuilder(Account, 'account')
          .where({ clientId, coinSymbol: body.coinSymbol })
          .setLock('pessimistic_write')
          .getOne();
        if (!account) {
          // throw new Error();
          channel.nack(msg, false, false);
          return;
        }
        if (Number(account.balance) < Number(body.amount)) {
          // throw new Error('Payment Required');
          channel.nack(msg, false, false);
          return;
        }
        await manager.decrement(
          Account,
          { clientId, coinSymbol: body.coinSymbol },
          'balance',
          Number(body.amount),
        );
        await manager
          .createQueryBuilder()
          .insert()
          .into(Withdrawal)
          .values({
            amount: body.amount,
            clientId,
            coinSymbol: body.coinSymbol,
            key: body.key,
            memo: body.memo,
            recipient: body.recipient,
          })
          .execute();
      });
      const w = (await Withdrawal.findOne({
        clientId,
        key: body.key,
      }))!;
      await agent.createWithdrawal(w);
      channel.ack(msg);
    });
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

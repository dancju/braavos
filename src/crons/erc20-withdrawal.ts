import { Injectable } from '@nestjs/common';
import bunyan from 'bunyan';
import { Cron, NestSchedule } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import { getManager } from 'typeorm';
import Web3 from 'web3';
import { Signature } from 'web3/eth/accounts';
import { AmqpService } from '../amqp/amqp.service';
import { ChainEnum } from '../chains';
import { CoinEnum } from '../coins';
import { Account } from '../entities/account.entity';
import { Addr } from '../entities/addr.entity';
import { Coin } from '../entities/coin.entity';
import { DepositStatus } from '../entities/deposit-status.enum';
import { Deposit } from '../entities/deposit.entity';
import { KvPair } from '../entities/kv-pair.entity';
import { WithdrawalStatus } from '../entities/withdrawal-status.enum';
import { Withdrawal } from '../entities/withdrawal.entity';

const { ETH } = CoinEnum;
const { ethereum } = ChainEnum;

@Injectable()
export abstract class Erc20Withdrawal extends NestSchedule {
  private readonly config: ConfigService;
  private readonly logger: bunyan;
  private readonly amqpService: AmqpService;
  private readonly web3: Web3;
  private readonly abi: any;
  private readonly coinSymbol: CoinEnum;
  private cronLock: any;
  private tokenService: any;

  constructor(
    config: ConfigService,
    logger: bunyan,
    amqpService: AmqpService,
    web3: Web3,
    coinSymbol: CoinEnum,
    tokenService: any,
  ) {
    super();
    this.config = config;
    this.logger = logger;
    this.amqpService = amqpService;
    this.web3 = web3;
    this.coinSymbol = coinSymbol;
    this.cronLock = {
      withdrawalCron: false,
    };
    this.tokenService = tokenService;
    this.abi = tokenService.abi;
  }

  @Cron('*/12 * * * * *', { startTime: new Date() })
  public async withdrawalCron(): Promise<void> {
    if (this.cronLock.withdrawalCron === true) {
      this.logger.warn('last erc20 withdrawal cron still in handling');
      return;
    }
    try {
      this.cronLock.withdrawalCron = true;
      const contractAddr: string = this.config.get(
        `erc20.${this.coinSymbol}.deposit.contractAddr`,
      );
      const decimals: number = this.config.get(
        `erc20.${this.coinSymbol}.deposit.decimals`,
      );
      const bmartHost: string = this.config.get('erc20.bmart.bmartHost');
      const bmartKey: string = this.config.get('erc20.bmart.bmartKey');
      const bmartSecret: string = this.config.get('erc20.bmart.bmartSecret');

      const contract = new this.web3.eth.Contract(this.abi, contractAddr);
      const collectAddr = await this.tokenService.getAddr(0, '0');
      const prv = this.tokenService.getPrivateKey(0, '0');

      while (true) {
        const wd = await Withdrawal.createQueryBuilder()
          .where({
            coinSymbol: this.coinSymbol,
            status: WithdrawalStatus.created,
            txHash: null,
          })
          .orderBy(`info->'nonce'`)
          .getMany();
        if (wd.length <= 0) {
          // logger.debug('no record');
          this.cronLock.withdrawalCron = false;
          break;
        }
        for (const i in wd) {
          if (!wd[i]) {
            continue;
          }
          let dbNonce: any;
          const fullNodeNonce = await this.web3.eth.getTransactionCount(
            collectAddr,
          );
          if (wd[i].info.nonce === null || wd[i].info.nonce === undefined) {
            await getManager().transaction(async (manager) => {
              await manager.query(`
                select * from kv_pair
                where key = 'ethWithdrawalNonce'
                for update
              `);
              const uu = await manager.query(`
                update kv_pair
                set value = to_json(value::text::integer + 1)
                where key = 'ethWithdrawalNonce'
                returning value as nonce
              `);
              dbNonce = uu[0].nonce;
              dbNonce = dbNonce - 1;
              await manager.query(`
                update withdrawal
                set info = (info || ('{"nonce":' || (${dbNonce}) || '}')::jsonb)
                where id = ${wd[i].id}
              `);
            });
          } else {
            dbNonce = wd[i].info.nonce;
          }

          /* compare nonce db - fullNode */
          if (dbNonce < fullNodeNonce) {
            // logger.fatal(`still have some txs to be handled`);
            this.cronLock.withdrawalCron = false;
            return;
          } else if (dbNonce > fullNodeNonce) {
            // logger.info('still have some txs to be handled');
            continue;
          } else {
            /* dbNonce === fullNodeNonce, broadcast transaction */
            const stringAmount = wd[i].amount.split('.');
            const preAmount = this.web3.utils.toBN(
              stringAmount[0] + stringAmount[1],
            );
            let amount: string;
            if (decimals <= 8) {
              amount = preAmount
                .div(this.web3.utils.toBN(Math.pow(10, 8 - decimals)))
                .toString();
            } else {
              amount = preAmount
                .mul(this.web3.utils.toBN(Math.pow(10, decimals - 8)))
                .toString();
            }
            const method = await contract.methods.transfer(
              wd[i].recipient,
              amount,
            );
            let txData;
            let gasLimit;
            try {
              txData = await method.encodeABI();
              gasLimit = await method.estimateGas({ from: collectAddr });
            } catch (err) {
              this.logger.error(err);
              this.cronLock.withdrawalCron = false;
              return;
            }
            const realGasPrice = await this.web3.eth.getGasPrice();
            const thisGasPrice = this.web3.utils
              .toBN(realGasPrice)
              .add(this.web3.utils.toBN(30000000000))
              .toString();
            /* Judge if collect wallet eth balance is suffient to pay the fee */
            const gasFee = this.web3.utils
              .toBN(gasLimit)
              .mul(this.web3.utils.toBN(thisGasPrice));
            const collectBalance = this.web3.utils.toBN(
              await this.web3.eth.getBalance(collectAddr),
            );
            if (collectBalance.lt(gasFee)) {
              // logger.error("Collect wallet eth balance is not enough");
              this.cronLock.withdrawalCron = false;
              return;
            }
            /* Judge if collect wallet has enough erc20 token */
            const ercBalance = await contract.methods
              .balanceOf(collectAddr)
              .call();
            if (
              this.web3.utils.toBN(ercBalance).lt(this.web3.utils.toBN(amount))
            ) {
              // logger.error(`erc20 balance is less than db record`);
              this.cronLock.withdrawalCron = false;
              return;
            }
            /* start erc20 withdraw */
            // logger.info
            const signTx = (await this.web3.eth.accounts.signTransaction(
              {
                data: txData,
                gas: gasLimit,
                gasPrice: thisGasPrice,
                nonce: dbNonce,
                to: contract.options.address,
              },
              prv,
            )) as Signature;

            try {
              const tx = await this.web3.eth
                .sendSignedTransaction(signTx.rawTransaction)
                .on('transactionHash', async (hash) => {
                  this.logger.info(
                    `withdrawTxHash ${this.coinSymbol}: ${hash}`,
                  );
                  await Withdrawal.createQueryBuilder()
                    .update()
                    .set({
                      feeAmount: 0,
                      feeSymbol: ETH,
                      status: WithdrawalStatus.finished,
                      txHash: hash,
                    })
                    .where({ id: wd[i].id })
                    .execute();
                  const ww = await Withdrawal.findOne({ id: wd[i].id });
                  if (ww) {
                    this.amqpService.updateWithdrawal(ww);
                  }
                  // logger.info("Finish update db | tokenName: " + tokenName);
                  // if (wd[i].memo === 'bmart') {
                  //   const bmartRes = await request
                  //     .post(`${bmartHost}/api/v1/withdraw/addWithdrawInfo`)
                  //     .query(
                  //       (() => {
                  //         const req: any = {
                  //           amount: wd[i].amount,
                  //           contractAddress: contractAddr,
                  //           from: collectAddr,
                  //           identify: 81,
                  //           key: bmartKey,
                  //           secret: bmartSecret,
                  //           to: wd[i].recipient,
                  //           txid: hash,
                  //         };
                  //         req.sign = crypto
                  //           .createHash('sha1')
                  //           .update(querystring.stringify(req))
                  //           .digest('hex');
                  //         delete req.secret;
                  //         return req;
                  //       })(),
                  //     );
                  //   // logger.info("Finish datastream");
                  // }
                });
            } catch (err) {
              this.logger.error(err);
            }
          }
        }
      }
      this.cronLock.withdrawalCron = false;
      return;
    } catch (err) {
      this.logger.error(err);
      this.cronLock.withdrawalCron = false;
    }
  }
}

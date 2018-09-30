import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfirmChannel, connect, Connection as AmqpConnection } from 'amqplib';
import BtcRpc from 'bitcoin-core';
import fs from 'fs';
import 'jest';
import yaml from 'js-yaml';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { ConfigService } from '../src/config/config.service';
import { BtcCreateDeposit } from '../src/crons/btc-create-deposit';
import { BtcUpdateDeposit } from '../src/crons/btc-update-deposit';
import { BtcUpdateWithdrawal } from '../src/crons/btc-update-withdrawal';
import { CronModule } from '../src/crons/cron.module';
import { HttpModule } from '../src/http/http.module';

describe('BTC (e2e)', () => {
  let app: INestApplication;
  let amqpConnection: AmqpConnection;
  let amqpChannel: ConfirmChannel;
  let rpc: BtcRpc;
  const signer = signature({
    algorithm: 'rsa-sha256',
    headers: ['(request-target)', 'date', 'content-md5'],
    key: fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii'),
    keyId: '/test/keys/1a:2b',
  });

  beforeAll(async () => {
    app = (await Test.createTestingModule({
      imports: [HttpModule, CronModule],
    }).compile()).createNestApplication();
    await app.init();
    expect(app).toBeDefined();
    // prepare AMQP
    amqpConnection = await connect(app.get(ConfigService).amqp);
    amqpChannel = await amqpConnection.createConfirmChannel();
    // prepare omnicored regtest
    rpc = app.get(BtcRpc);
    const info = await rpc.getBlockchainInfo();
    expect(info.chain).toStrictEqual('regtest');
    expect(info.bip9_softforks.segwit.status).toStrictEqual('active');
    expect(await rpc.getBalance()).toBeGreaterThanOrEqual(11600);
  });

  it('GET /coins', (done) => {
    request(app.getHttpServer())
      .get('/coins?coinSymbol=BTC')
      .use(signer)
      .expect(200)
      .end((err, res) => {
        if (err) {
          done.fail(err);
        }
        expect(res.body.chain).toStrictEqual('bitcoin');
        expect(res.body.symbol).toStrictEqual('BTC');
        done();
      });
  });

  it('GET /addrs', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=BTC&path=0')
      .use(signer)
      .expect(200, '2NDuxXQ9iGCZ29Z8M76pWyTPmuFrJUsHMEx', done);
  });

  it('should handle deposits', async (done) => {
    const txHash = await rpc.sendToAddress(
      '2NDuxXQ9iGCZ29Z8M76pWyTPmuFrJUsHMEx',
      1,
    );
    expect(typeof txHash).toStrictEqual('string');
    await app.get(BtcCreateDeposit).cron();
    await new Promise((resolve) => {
      amqpChannel.consume('deposit_creation', async (msg) => {
        const body = JSON.parse(msg!.content.toString());
        if (body.txHash === txHash) {
          amqpChannel.ack(msg!);
          expect(body.status).toStrictEqual('unconfirmed');
          resolve();
        } else {
          amqpChannel.nack(msg!);
        }
      });
    });
    await rpc.generate(app.get(ConfigService).bitcoin.btc.confThreshold);
    await app.get(BtcUpdateDeposit).cron();
    await new Promise((resolve) => {
      amqpChannel.consume('deposit_update', async (msg) => {
        const body = JSON.parse(msg!.content.toString());
        if (body.txHash === txHash) {
          amqpChannel.ack(msg!);
          expect(body.status).toStrictEqual('confirmed');
          resolve();
        } else {
          amqpChannel.nack(msg!);
        }
      });
    });
    done();
  });

  it(
    'should handle withdrawals',
    async (done) => {
      const lW = yaml.safeLoad(
        fs.readFileSync(
          __dirname + '/fixtures/bitcoin-withdrawals.yml',
          'ascii',
        ),
      ) as Array<{ amount: number; recipient: string }>;
      const lW0 = lW.slice(0, lW.length / 2);
      const lW1 = lW.slice(lW.length / 2);
      lW0.forEach((w, i) =>
        amqpChannel.sendToQueue(
          'withdrawal_creation',
          Buffer.from(
            JSON.stringify({
              amount: w.amount,
              coinSymbol: 'BTC',
              key: i,
              recipient: w.recipient,
            }),
          ),
        ),
      );
      await amqpChannel.waitForConfirms();
      // TODO fix smell
      await new Promise((resolve) => setTimeout(resolve, 4000));
      let res = (await request(app.getHttpServer())
        .get('/withdrawals?offset=0&limit=64')
        .use(signer)
        .expect(200)).body;
      expect(res).toHaveLength(lW0.length);
      res.sort((a: any, b: any) => Number(a.amount) - Number(b.amount));
      for (let i = 0; i < lW0.length; i++) {
        expect(res[i]).toMatchObject({
          clientId: 0,
          coinSymbol: 'BTC',
          key: String(i),
          recipient: lW0[i].recipient,
          status: 'created',
        });
        expect(Number(res[i].amount)).toStrictEqual(lW0[i].amount);
      }
      await app.get(BtcUpdateWithdrawal).cron();
      lW1.forEach((w, i) =>
        amqpChannel.sendToQueue(
          'withdrawal_creation',
          Buffer.from(
            JSON.stringify({
              amount: w.amount,
              coinSymbol: 'BTC',
              key: i,
              recipient: w.recipient,
            }),
          ),
        ),
      );
      await amqpChannel.waitForConfirms();
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await app.get(BtcUpdateWithdrawal).cron();
      res = (await request(app.getHttpServer())
        .get('/withdrawals?offset=0&limit=64')
        .use(signer)
        .expect(200)).body;
      // expect(res).toHaveLength(lW.length);
      // console.log(res);
      // res.sort((a, b) => a.amount - b.amount);
      // for (let i = 0; i < withdrawals.length; i++) {
      //   expect(res[i]).toMatchObject({
      //     clientId: 0,
      //     coinSymbol: 'BTC',
      //     key: String(i),
      //     recipient: withdrawals[i].recipient,
      //     status: 'finished',
      //   });
      // }
      // x await new Promise((resolve) => {
      //   amqpChannel.consume('withdrawal_update', async (msg) => {
      //     const body = JSON.parse(msg!.content.toString());
      //     if (body.key === 'foo') {
      //       amqpChannel.ack(msg!);
      //       expect(body.status).toStrictEqual('confirmed');
      //       resolve();
      //     } else {
      //       amqpChannel.nack(msg!);
      //     }
      //   });
      // });
      done();
    },
    10000,
  );

  afterAll(async () => {
    await amqpConnection.close();
    await app.close();
  });
});

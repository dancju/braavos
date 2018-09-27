import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, Connection } from 'amqplib';
import BtcRpc from 'bitcoin-core';
import fs from 'fs';
import 'jest';
import { defaults } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { BtcCreateDeposit } from '../src/crons/btc-create-deposit';
import { BtcUpdateDeposit } from '../src/crons/btc-update-deposit';
import { CronModule } from '../src/crons/cron.module';
import { HttpModule } from '../src/http/http.module';

describe('BTC (e2e)', () => {
  let app: INestApplication;
  let amqpConnection: Connection;
  let rpc: BtcRpc;
  const signer = signature({
    algorithm: 'rsa-sha256',
    headers: ['(request-target)', 'date', 'content-md5'],
    key: fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii'),
    keyId: '/test/keys/1a:2b',
  });

  beforeAll(async () => {
    defaults.enable = false;
    app = (await Test.createTestingModule({
      imports: [HttpModule, CronModule],
    }).compile()).createNestApplication();
    await app.init();
    // seeding database
    await app.get(EntityManager).query(`
      insert into client (
        id, name, "publicKey"
      ) values (
        0, 'test', '${fs.readFileSync(__dirname + '/fixtures/public.pem')}'
      )
    `);
    // prepare AMQP
    amqpConnection = await connect(app.get(ConfigService).get('amqp'));
    // prepare Omnicored regtest
    rpc = app.get(BtcRpc);
  });

  it('should have the test client', async (done) => {
    expect(app).toBeDefined();
    done();
  });

  it('should have the omnicored regtest connection', async (done) => {
    const info = await rpc.getBlockchainInfo();
    expect(info.chain).toStrictEqual('regtest');
    expect(info.blocks).toBeGreaterThanOrEqual(1);
    expect(info.bip9_softforks.segwit.status).toStrictEqual('active');
    expect(Number(info.difficulty)).toBeGreaterThan(0);
    expect(await rpc.getBalance()).toBeGreaterThanOrEqual(50);
    done();
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
        expect(res.body.depositFeeSymbol).toStrictEqual('BTC');
        expect(res.body.withdrawalFeeSymbol).toStrictEqual('BTC');
        done();
      });
  });

  it('GET /addrs', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=BTC&path=0')
      .use(signer)
      .expect(200, '2NCmoukMBbhnir5X2HQkVxtK2zRsL62FDxw', done);
  });

  it('should handle deposits', async (done) => {
    const txHash = await rpc.sendToAddress(
      '2NCmoukMBbhnir5X2HQkVxtK2zRsL62FDxw',
      1,
    );
    expect(typeof txHash).toStrictEqual('string');
    await app.get(BtcCreateDeposit).cron();
    // TODO mq
    // expect((await manager.findOne(Deposit, { txHash }))!.status).toStrictEqual(
    //   'unconfirmed',
    // );
    await rpc.generate(2);
    await app.get(BtcUpdateDeposit).cron();
    // TODO mq
    // expect((await manager.findOne(Deposit, { txHash }))!.status).toStrictEqual(
    //   'confirmed',
    // );
    done();
  });

  it('should handle withdrawals', async (done) => {
    const queue = 'withdrawal_creation';
    const channel = await amqpConnection.createConfirmChannel();
    await channel.assertQueue(queue);
    await new Promise((resolve) =>
      channel.sendToQueue(
        queue,
        Buffer.from(
          JSON.stringify({
            amount: '1',
            coinSymbol: 'BTC',
            key: 'foo',
            recipient: '2PcRdHdFX8qm6rh6CHhSzR1w8XCBArJg86',
          }),
        ),
        {},
        (err, ok) => {
          if (err) {
            done.fail(err);
          } else {
            resolve();
          }
        },
      ),
    );
    // TODO mq
    // console.log(await Withdrawal.find());
    // expect((await Withdrawal.findOne({ key: 'foo' }))!.recipient).toStrictEqual(
    //   '2PcRdHdFX8qm6rh6CHhSzR1w8XCBArJg86',
    // );
    done();
  });

  afterAll(async () => {
    await app.get(EntityManager).query('DELETE FROM client WHERE id = 0;');
    await amqpConnection.close();
    await app.close();
  });
});

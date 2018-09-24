import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, Connection } from 'amqplib';
import BtcRpc from 'bitcoin-core';
import fs from 'fs';
import 'jest';
import { ConfigService } from 'nestjs-config';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { AmqpService } from '../src/amqp/amqp.service';
import { CoinEnum } from '../src/coins';
import { BtcCreateDeposit } from '../src/crons/btc-create-deposit';
import { BtcUpdateDeposit } from '../src/crons/btc-update-deposit';
import { CronModule } from '../src/crons/cron.module';
import { Client } from '../src/entities/client.entity';
import { DepositStatus } from '../src/entities/deposit-status.enum';
import { Deposit } from '../src/entities/deposit.entity';
import { HttpModule } from '../src/http/http.module';

describe('BTC (e2e)', () => {
  let app: INestApplication;
  let manager: EntityManager;
  let amqpConnection: Connection;
  let rpc: BtcRpc;
  let config: ConfigService;
  let coinServiceRepo: { [_ in CoinEnum]?: ICoinService };
  let amqpService: AmqpService;
  const signer = signature({
    algorithm: 'rsa-sha256',
    headers: ['(request-target)', 'date', 'content-md5'],
    key: fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii'),
    keyId: '/test/keys/1a:2b',
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [HttpModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // seeding database
    manager = app.get(EntityManager);
    await manager.query(`
      insert into client (
        id, name, "publicKey"
      ) values (
        0, 'test', '${fs.readFileSync(__dirname + '/fixtures/public.pem')}'
      )
    `);
    // prepare config
    config = app.get(ConfigService);
    // prepare AMQP
    amqpConnection = await connect(config.get('amqp'));
    // prepare Omnicored regtest
    rpc = app.get(BtcRpc);
    // generate at least 432 blocks to activate SegWit
    await rpc.generate(432);
    // prepare injections
    coinServiceRepo = app.get('CoinServiceRepo');
    amqpService = new AmqpService(amqpConnection, coinServiceRepo);
  });

  it('http server and database should be initialised', async (done) => {
    expect(app).toBeDefined();
    expect(manager).toBeDefined();
    expect((await manager.findOne(Client, { name: 'test' }))!.id).toStrictEqual(
      0,
    );
    expect(app.get(ConfigService).get('master.environment')).toStrictEqual(
      'test',
    );
    done();
  });

  it('omnicored regtest should be initialised', async (done) => {
    const info = await rpc.getBlockchainInfo();
    expect(info.chain).toStrictEqual('regtest');
    expect(info.blocks).toBeGreaterThanOrEqual(1);
    expect(info.bip9_softforks.segwit.status).toStrictEqual('active');
    expect(Number(info.difficulty)).toBeGreaterThan(0);
    expect(await rpc.getBalance()).toBeGreaterThanOrEqual(50);
    done();
  });

  it('GET /coins?coinSymbol=BTC', (done) => {
    request(app.getHttpServer())
      .get('/coins?coinSymbol=BTC')
      .use(signer)
      .expect(200)
      .end((err, res) => {
        if (err) {
          done(err);
        }
        expect(res.body.chain).toStrictEqual('bitcoin');
        expect(res.body.symbol).toStrictEqual('BTC');
        expect(res.body.depositFeeSymbol).toStrictEqual('BTC');
        expect(res.body.withdrawalFeeSymbol).toStrictEqual('BTC');
        done();
      });
  });

  it('GET /addrs?coinSymbol=BTC&path=0', (done) => {
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
    await new BtcCreateDeposit(rpc, amqpService, config).cron();
    expect((await manager.findOne(Deposit, { txHash }))!.status).toStrictEqual(
      'unconfirmed',
    );
    await rpc.generate(2);
    await new BtcUpdateDeposit(rpc, amqpService, config).cron();
    expect((await manager.findOne(Deposit, { txHash }))!.status).toStrictEqual(
      'confirmed',
    );
    done();
    // TODO fetch from mq
  });

  it('should handle withdrawals', async (done) => {
    const queue = 'withdrawal_creation';
    const connection = app.get('amqp-connection') as Connection;
    const channel = await connection.createChannel();
    await channel.assertQueue(queue);
    // channel.sendToQueue(
    //   queue,
    //   Buffer.from(
    //     JSON.stringify({
    //       amount: '1',
    //       coinSymbol: 'BTC',
    //       key: '0',
    //       recipient: '3PcRdHdFX8qm6rh6CHhSzR1w8XCBArJg86',
    //     }),
    //   ),
    // );
    done();
  });

  afterAll(async () => {
    await manager.query('DELETE FROM client WHERE id = 0;');
    await amqpConnection.close();
    await app.close();
  });
});

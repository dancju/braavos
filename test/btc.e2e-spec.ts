import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, Connection } from 'amqplib';
import BtcRpc from 'bitcoin-core';
import fs from 'fs';
import 'jest';
import { InjectAmqpConnection } from 'nestjs-amqp';
import { ConfigModule, ConfigService } from 'nestjs-config';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { Client } from '../src/entities/client.entity';
import { HttpModule } from '../src/http/http.module';

describe('BTC (e2e)', () => {
  let app: INestApplication;
  let manager: EntityManager;
  let amqp: Connection;
  let rpc: BtcRpc;
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
    manager = app.get(EntityManager);
    await manager.query(`
      insert into client (
        id, name, "publicKey"
      ) values (
        0, 'test', '${fs.readFileSync(__dirname + '/fixtures/public.pem')}'
      )
    `);
    amqp = await connect(app.get(ConfigService).get('amqp'));
    rpc = app.get(BtcRpc);
    rpc.generate(101);
  });

  it('should be initialised', async (done) => {
    expect(app).toBeDefined();
    expect(manager).toBeDefined();
    expect((await manager.findOne(Client, { name: 'test' }))!.id).toStrictEqual(
      0,
    );
    expect(app.get(ConfigService).get('master.environment')).toStrictEqual(
      'test',
    );
    expect((await rpc.getBlockchainInfo()).chain).toStrictEqual('regtest');
    expect(await rpc.getBlockCount()).toBeGreaterThanOrEqual(1);
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

  it('should publish deposit creation', async (done) => {
    expect(
      typeof (await rpc.sendToAddress(
        '2NCmoukMBbhnir5X2HQkVxtK2zRsL62FDxw',
        1,
      )),
    ).toStrictEqual('string');
  });

  // it('should consume withdrawal creation', async (done) => {
  //   const queue = 'withdrawal_creation';
  //   const connection = app.get('amqp-connection') as Connection;
  //   const channel = await connection.createChannel();
  //   await channel.assertQueue(queue);
  //   channel.sendToQueue(
  //     queue,
  //     Buffer.from(
  //       JSON.stringify({
  //         amount: '1',
  //         coinSymbol: 'BTC',
  //         key: '0',
  //         recipient: '3PcRdHdFX8qm6rh6CHhSzR1w8XCBArJg86',
  //       }),
  //     ),
  //   );
  //   done();
  // });

  // it('should publish deposit creation', async (done) => {
  //   const queue = 'deposit_creation';
  //   const amqp = app.get(AmqpService);
  //   const channel = await amqp.connection.createChannel();
  //   await channel.assertQueue(queue);
  //   channel.sendToQueue(
  //     queue,
  //     Buffer.from(
  //       JSON.stringify({
  //         id: 1,
  //         coinSymbol: 'BTC',
  //         addrPath: '1',
  //         amount: '1.2',
  //         // feeAmount: number;
  //         // feeSymbol: ;
  //         status: 'unconfirmed',
  //         // txHash: string;
  //         createdAt: new Date(),
  //       }),
  //     ),
  //   );
  //   done();
  // });

  afterAll(async () => {
    await manager.transaction(async (transactionalManager) => {
      await transactionalManager.query(
        'DELETE FROM account WHERE "clientId" = 0;',
      );
      await transactionalManager.query(
        'DELETE FROM addr WHERE "clientId" = 0;',
      );
      await transactionalManager.query('DELETE FROM client WHERE id = 0;');
    });
    await app.close();
  });
});

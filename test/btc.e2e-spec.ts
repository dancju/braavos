import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Connection } from 'amqplib';
import fs from 'fs';
import 'jest';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { ClientModule } from '../src/client.module';
import { Client } from '../src/entities/client.entity';

describe('Client Controller (e2e)', () => {
  let app: INestApplication;
  let manager: EntityManager;
  const signer = signature({
    algorithm: 'rsa-sha256',
    headers: ['(request-target)', 'date', 'content-md5'],
    key: fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii'),
    keyId: '/test/keys/1a:2b',
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ClientModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    manager = app.get(EntityManager);
    expect(app).toBeDefined();
    expect(manager).toBeDefined();
  });

  it('should have the test client', async (done) => {
    expect(app).toBeDefined();
    expect(manager).toBeDefined();
    // const manager = app.get(EntityManager);
    const key = fs.readFileSync(__dirname + '/fixtures/public.pem', 'ascii');
    await manager.query(
      `insert into client (id, name, "publicKey") values (0, 'test', '${key}')`,
    );
    const client = await manager.findOne(Client, { name: 'test' });
    expect(client!.id).toStrictEqual(0);
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
      .expect(200, '3BAgZXJzTogswV16nnZcxAxtsJpCiGUFPJ', done);
  });

  it('should consume withdrawal creation', async (done) => {
    const queue = 'withdrawal_creation';
    const connection = app.get('amqp-connection') as Connection;
    const channel = await connection.createChannel();
    await channel.assertQueue(queue);
    channel.sendToQueue(
      queue,
      Buffer.from(
        JSON.stringify({
          amount: '1',
          coinSymbol: 'BTC',
          key: '0',
          recipient: '3PcRdHdFX8qm6rh6CHhSzR1w8XCBArJg86',
        }),
      ),
    );
    done();
  });

  afterAll(async () => {
    // const manager = app.get(EntityManager);
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

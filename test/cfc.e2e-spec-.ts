import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import fs from 'fs';
import 'jest';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { ClientModule } from '../src/client.module';
import { Client } from '../src/entities/client.entity';

describe('Client Controller (e2e)', () => {
  let app: INestApplication;
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
  });

  it('should have the test client', async (done) => {
    const manager = app.get(EntityManager);
    const key = fs.readFileSync(__dirname + '/fixtures/public.pem', 'ascii');
    await manager.query(
      `insert into client (id, name, "publicKey") values (0, 'test', '${key}')`,
    );
    const client = await manager.findOne(Client, { name: 'test' });
    expect(client!.id).toStrictEqual(0);
    done();
  });

  it('GET /coins?coinSymbol=CFC', (done) => {
    request(app.getHttpServer())
      .get('/coins?coinSymbol=CFC')
      .use(signer)
      .expect(200)
      .end((err, res) => {
        if (err) {
          done(err);
        }
        expect(res.body.chain).toStrictEqual('ethereum');
        expect(res.body.symbol).toStrictEqual('CFC');
        expect(res.body.depositFeeSymbol).toStrictEqual('ETH');
        expect(res.body.withdrawalFeeSymbol).toStrictEqual('ETH');
        done();
      });
  });

  it('GET /addrs?coinSymbol=CFC&path=0', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=CFC&path=0')
      .use(signer)
      .expect(200, '0x577E5592a9DE963f1DC0260bC6EB58f6eAbAA1BD', done);
  });

  afterAll(async () => {
    const manager = app.get(EntityManager);
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

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
  });

  it('should have the test client', async (done) => {
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

  it('should push ', async (done) => {
    // const deposit = await Deposit.create({
    //   addrPath: '1',
    //   amount: '1',
    //   clientId: 1,
    //   coinSymbol: CoinSymbol.CFC,
    //   feeAmount: 0.1,
    //   feeSymbol: CoinSymbol.ETH,
    //   status: DepositStatus.unconfirmed,
    //   txHash: '0x98098fdaf8b8b99a3564',
    // }).save();
    done();
  });

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

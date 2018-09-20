import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import fs from 'fs';
import 'jest';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { Client } from '../src/entities/client.entity';
import { Coin } from '../src/entities/coin.entity';
import { Deposit } from '../src/entities/deposit.entity';
import { CoinSymbol } from '../src/utils/coin-symbol.enum';
import { DepositStatus } from '../src/utils/deposit-status.enum';
import { ClientModule } from './../src/client.module';

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
    await manager
      .createQueryBuilder()
      .insert()
      .into(Client)
      .values({
        name: 'test',
        publicKey: fs.readFileSync(__dirname + '/fixtures/public.pem', 'ascii'),
      })
      .onConflict('("name") DO NOTHING')
      .execute();
    const client = await manager.findOne(Client, { name: 'test' });
    expect(client!.id).toStrictEqual(1);
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

  it('GET /addrs?coinSymbol=BTC&path=0', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=BTC&path=0')
      .use(signer)
      .expect(200, '37qqBVABoa5B7TXGHRR8Pf2MjHWLF3nAdj', done);
  });

  it('GET /addrs?coinSymbol=CFC&path=0', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=CFC&path=0')
      .use(signer)
      .expect(200, '0xC6D5937073aa6FE236ee6bEA0165867d9f7a84F5', done);
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
    await manager
      .createQueryBuilder()
      .delete()
      .from(Client)
      .where('id = 0')
      .execute();
    await app.close();
  });
});

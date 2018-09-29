import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, Connection } from 'amqplib';
import fs from 'fs';
import 'jest';
import { defaults } from 'nest-schedule';
import { ConfigService } from 'nestjs-config';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import Web3 from 'web3';
import { CronModule } from '../src/crons/cron.module';
import { HttpModule } from '../src/http/http.module';

describe('ETH (e2e)', () => {
  let app: INestApplication;
  let amqpConnection: Connection;
  let web3: Web3;
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
    // prepare Web3
    web3 = app.get(Web3);
  });

  it('GET /coins', (done) => {
    request(app.getHttpServer())
      .get('/coins?coinSymbol=ETH')
      .use(signer)
      .expect(200)
      .end((err, res) => {
        if (err) {
          done.fail(err);
        }
        expect(res.body.chain).toStrictEqual('ethereum');
        expect(res.body.symbol).toStrictEqual('ETH');
        expect(res.body.depositFeeSymbol).toStrictEqual('ETH');
        expect(res.body.withdrawalFeeSymbol).toStrictEqual('ETH');
        done();
      });
  });

  it('GET /addrs', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=ETH&path=1')
      .use(signer)
      .expect(200, '0x577E5592a9DE963f1DC0260bC6EB58f6eAbAA1BD', done);
  });

  afterAll(async () => {
    await app.get(EntityManager).query('DELETE FROM client WHERE id = 0;');
    await amqpConnection.close();
    await app.close();
  });
});

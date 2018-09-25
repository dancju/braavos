import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { connect, Connection } from 'amqplib';
import fs from 'fs';
import 'jest';
import { ConfigService } from 'nestjs-config';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { AmqpService } from '../src/amqp/amqp.service';
import { CoinEnum } from '../src/coins';
import { CronModule } from '../src/crons/cron.module';
import { Client } from '../src/entities/client.entity';
import { DepositStatus } from '../src/entities/deposit-status.enum';
import { Deposit } from '../src/entities/deposit.entity';
import { Withdrawal } from '../src/entities/withdrawal.entity';
import { HttpModule } from '../src/http/http.module';

describe('CFC (e2e)', () => {
  let app: INestApplication;
  let manager: EntityManager;
  let amqpConnection: Connection;
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
    // prepare injections
    coinServiceRepo = app.get('CoinServiceRepo');
    amqpService = new AmqpService(amqpConnection, coinServiceRepo);
  });

  it('should have the test client', async (done) => {
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

  it('GET /coins', (done) => {
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

  it('GET /addrs', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=CFC&path=1')
      .use(signer)
      .expect(200, '0x577E5592a9DE963f1DC0260bC6EB58f6eAbAA1BD', done);
  });

  afterAll(async () => {
    await manager.query('DELETE FROM client WHERE id = 0;');
    await amqpConnection.close();
    await app.close();
  });
});

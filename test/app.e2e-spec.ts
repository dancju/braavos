import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import fs from 'fs';
import 'jest';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { EntityManager } from 'typeorm';
import { Client } from '../src/entities/client.entity';
import { Coin } from '../src/entities/coin.entity';
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
    // const c = await manager.createQueryBuilder(Client, 'c').getMany();
    // console.log(c);
  });

  it('GET /coins', (done) => {
    request(app.getHttpServer())
      .get('/addrs?coinSymbol=CFC&path=0')
      .use(signer)
      .expect(200)
      .end((err, res) => {
        if (err) {
          done(err);
        }
        expect(res.text).toStrictEqual(
          '0xC55Ab542B9BcB050ed78BEa37a0Edf64727086E8',
        );
        done();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});

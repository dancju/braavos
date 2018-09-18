import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import fs from 'fs';
import signature from 'superagent-http-signature';
import request from 'supertest';
import { ClientModule } from './../src/client.module';

describe('Client Controller (e2e)', () => {
  let app: INestApplication;
  const signer = signature({
    algorithm: 'rsa-sha256',
    headers: ['(request-target)', 'date', 'content-md5'],
    key: fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii'),
    keyId: 'test',
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ClientModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /coins', () => {
    return request(app.getHttpServer())
      .get('/coins')
      .use(signer)
      .expect(200);
  });
});

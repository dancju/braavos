// tslint:disable:no-console
import fs from 'fs';
import request from 'superagent';
import signature from 'superagent-http-signature';

const key = fs.readFileSync(__dirname + '/fixtures/private.pem', 'ascii');

const getAddr = async () => {
  try {
    const res = await request
      .get('http://localhost:3000/addrs?coinSymbol=BTC&path=1')
      .use(
        signature({
          algorithm: 'rsa-sha256',
          headers: ['(request-target)', 'date', 'content-md5'],
          key,
          keyId: 'test',
        }),
      );
    console.log(res.text);
  } catch (err) {
    console.log(err.response);
  }
};

const putWithdrawal = async () => {
  try {
    const res = await request
      .put('http://localhost:3000/withdrawals')
      .send({
        amount: 1,
        coinSymbol: 'BTC',
        key: 1,
        recipient: '35UpN99tzGJPo52S3SmGAf7MYv9GpWrctk',
      })
      .use(
        signature({
          algorithm: 'rsa-sha256',
          headers: ['(request-target)', 'date', 'content-md5'],
          key,
          keyId: 'test',
        }),
      );
    console.log(res.body);
  } catch (err) {
    console.log(err.response);
  }
};

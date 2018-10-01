const dotenv = require('dotenv');
const fs = require('fs');
const schedule = require('nest-schedule');
const { createConnection } = require('typeorm');

module.exports = async () => {
  dotenv.config({ path: './test/env' });
  schedule.defaults.enable = false;
  const connection = await createConnection();
  await connection.runMigrations();
  await connection.query(`
    insert into client (
      id, name, "publicKey"
    ) values (
      0, 'test', '${fs.readFileSync(__dirname + '/fixtures/public.pem')}'
    )
  `);
  await connection.close();
};

require('ts-node').register({ compilerOptions: { noImplicitAny: false } });

export default {
  database: process.env.TYPEORM_DATABASE,
  entities: [process.env.TYPEORM_ENTITIES],
  host: process.env.TYPEORM_HOST,
  migrations: [process.env.TYPEORM_MIGRATIONS],
  password: process.env.TYPEORM_PASSWORD,
  port: Number(process.env.TYPEORM_PORT),
  type: process.env.TYPEORM_CONNECTION,
  username: process.env.TYPEORM_USERNAME,
};

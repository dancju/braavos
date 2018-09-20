export default {
  cli: { migrationsDir: 'src/migrations' },
  database: process.env.TYPEORM_DATABASE || 'braavos',
  entities: [__dirname + '/../**/*.entity.ts'],
  host: process.env.TYPEORM_HOST || 'localhost',
  migrations: [__dirname + '/../**/*.migration.ts'],
  password: process.env.TYPEORM_PASSWORD || 'postgres_password',
  port: Number(process.env.TYPEORM_PORT) || 5432,
  type: process.env.TYPEORM_CONNECTION || 'postgres',
  username: process.env.TYPEORM_USERNAME || 'postgres',
};

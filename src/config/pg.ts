export default (process.env.NODE_ENV === 'production'
  ? {
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
    }
  : {
      database: 'braavos',
      host: '35.194.208.25',
      password: 'F4eNPF1iunlJNzt4',
      port: 5432,
      username: 'postgres',
    });

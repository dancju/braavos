export default {
  database: process.env.DB_NAME || 'braavos',
  host: process.env.DB_HOST || '35.194.208.25',
  password: process.env.DB_PASSWORD || 'F4eNPF1iunlJNzt4',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
};

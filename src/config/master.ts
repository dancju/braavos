export default {
  environment: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  isProduction() {
    return this.get('client.environment') === 'production';
  },
};

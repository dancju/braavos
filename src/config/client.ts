export default {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.CLIENT_PORT || 3000,
  isProduction() {
    return this.get('client.environment') === 'production';
  },
};

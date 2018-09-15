export default {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.EXPRESS_PORT || 3000,
  isProduction() {
    return this.get('express.environment') === 'production';
  },
};

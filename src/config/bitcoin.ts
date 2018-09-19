export default {
  bech32: false,
  btc: {
    confThreshold: 2,
    deposit: {
      step: 8,
    },
    fee: {
      confTarget: 6,
      txSizeKb: 0.4,
    },
    withdrawal: {
      step: 512,
    },
  },
  rpc: {
    host: process.env.OMNICORED_HOST || '35.229.211.83',
    network: process.env.OMNICORED_NETWORK || 'testnet',
    password:
      process.env.OMNICORED_PASSWORD ||
      'Ix8MohD4YzJtcpR-TKFZzeUo_W9fPwO2W9mB0GbDizs=',
    username: process.env.OMNICORED_USERNAME || 'daniel',
  },
  usdt: {},
};

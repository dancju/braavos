export default {
  bech32: false,
  btc: {
    confThreshold: 2,
    fee: {
      confTarget: 6,
      txSizeKb: 0.4,
    },
    withdrawalStep: 512,
  },
  rpc: {
    host: process.env.OMNICORED_HOST,
    network: process.env.OMNICORED_NETWORK,
    password: process.env.OMNICORED_PASSWORD,
    username: process.env.OMNICORED_USERNAME,
  },
  usdt: {},
};

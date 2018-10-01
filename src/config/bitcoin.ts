export default class EthereumConfig {
  public static bech32 = false;

  static get rpc() {
    return {
      host: process.env.OMNICORED_HOST,
      network: ((): 'mainnet' | 'regtest' | 'testnet' => {
        const res = process.env.OMNICORED_NETWORK;
        if (res !== 'mainnet' && res !== 'regtest' && res !== 'testnet') {
          throw new Error();
        }
        return res;
      })(),
      password: process.env.OMNICORED_PASSWORD,
      username: process.env.OMNICORED_USERNAME,
    };
  }

  public static btc = {
    confThreshold: 2,
    fee: {
      confTarget: 6,
      txSizeKb: 0.4,
    },
    withdrawalStep: 512,
  };

  public static usdt = {};
}

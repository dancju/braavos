import { CoinEnum } from '../coins';

export default class EthereumConfig {
  public static get web3() {
    const res = process.env.WEB3_RPC;
    if (!res || !res.startsWith('http')) {
      throw new Error();
    }
    return res;
  }

  public static bmart = {
    bmartHost: 'https://api.bmart.io/',
    bmartKey: 'a171c650b67e647e7a35052b8b5d4e64d',
    bmartSecret: '5aaf0b7d9b4ea9c52f6a70bbffec779a',
  };

  public static pocketAddr = '0x55F71854c4094d659A1c303A6E507A77ce727509';

  public static pocketPrv =
    '0xecee39f1c2c73e661ba48f8d8110dd4ef4af98fe7fe451f6cb91cb53d6adcc37';

  public static ETH = {
    collect: {
      confThreshold: 10,
    },
    deposit: {
      minimumThreshold: 10000000000000000, // 0.01 ether
      step: 60,
    },
    withdraw: {},
  };

  public static CFC = {
    collect: {
      confThreshold: 10,
      decimals: 8,
    },
    contractAddr: '0x64c289C22Fd7EC36a766cc7C0b6b60C73BAF9B48',
    deposit: {
      _from: '_from',
      _to: '_to',
      _value: '_value',
      decimals: 8,
      minThreshold: 10,
      step: 300,
    },
    withdraw: {
      decimals: 8,
    },
  };

  public static get(symbol: CoinEnum) {
    // tslint:disable-next-line:no-small-switch
    switch (symbol) {
      case CoinEnum.CFC:
        return this.CFC;
      default:
        throw new Error();
    }
  }
}

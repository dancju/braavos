export default {
  CFC: {
    collect: {
      confThreshold: 10,
      contractAddr: '0x8631409593B6e089e17dae1607B6e75825Df62F0',
      decimals: 8,
      pocketAddr: '0x55F71854c4094d659A1c303A6E507A77ce727509',
      pocketPrv:
        '0xecee39f1c2c73e661ba48f8d8110dd4ef4af98fe7fe451f6cb91cb53d6adcc37',
    },
    deposit: {
      _from: '_from',
      _to: '_to',
      _value: '_value',
      contractAddr: '0x8631409593B6e089e17dae1607B6e75825Df62F0',
      decimals: 8,
      minThreshold: 10,
      step: 300,
    },
    withdraw: {
      contractAddr: '0x8631409593B6e089e17dae1607B6e75825Df62F0',
      decimals: 8,
    },
  },
  bmart: {
    bmartHost: 'https://api.bmart.io/',
    bmartKey: 'a171c650b67e647e7a35052b8b5d4e64d',
    bmartSecret: '5aaf0b7d9b4ea9c52f6a70bbffec779a',
  },
  web3: process.env.WEB3_RPC,
};

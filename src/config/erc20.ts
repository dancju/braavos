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
    bmartHost: 'http://47.75.205.44:8090/',
    bmartKey: 'a6c70ae31673c489b8ad466a3254ba89c',
    bmartSecret: '1b9b280b7a7ab1dd6d6d9ab9394a29bb',
  },
  web3: process.env.WEB3_RPC,
};

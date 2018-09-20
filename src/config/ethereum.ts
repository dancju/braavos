export default {
  ether: {
    collect: {
      confThreshold: 10,
    },
    deposit: {
      minimumThreshold: 20000000000000000, // 0.02 ether
      pocketAddr: '0x55F71854c4094d659A1c303A6E507A77ce727509',
      step: 60,
    },
    withdraw: {},
  },
  web3: process.env.WEB3_RPC || 'http://35.196.123.227:8547',
};

import { mnemonicToSeed } from 'bip39';

export default {
  mnemonic: process.env.MNEMONIC || '一 一 一',
  seed(): Buffer {
    return mnemonicToSeed(this.get('crypto.mnemonic'));
  },
};

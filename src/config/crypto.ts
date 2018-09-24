import { mnemonicToSeed } from 'bip39';

export default {
  mnemonic: process.env.MNEMONIC,
  seed(): Buffer {
    return mnemonicToSeed(this.get('crypto.mnemonic'));
  },
};

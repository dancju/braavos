import { mnemonicToSeed } from 'bip39';

export default {
  mnemonic: 'biu biu biu',
  seed(): Buffer {
    return mnemonicToSeed(this.get('crypto.mnemonic'));
  },
};

import { fromBase58, fromSeed } from 'bip32';
import { hdkey } from 'ethereumjs-wallet';

export default {
  bitcoinBech32: false,
  seed: new Buffer(''),
  get bitcoinXPrv(): string {
    const seed = this.get('crypto.seed');
    return fromSeed(seed)
      .derivePath(`m/84'/0'/0'/0`)
      .toBase58();
  },
  get bitcoinXPub(): string {
    const xprv = this.get('crypto.bitcoinXPrv');
    if (!xprv.startsWith('xprv')) {
      throw new Error();
    }
    return fromBase58(xprv)
      .neutered()
      .toBase58();
  },
  get ethereumXPrv(): string {
    const seed = this.get('crypto.seed');
    return hdkey
      .fromMasterSeed(seed)
      .derivePath(`m/44'/60'/0'/0`)
      .privateExtendedKey();
  },
  get ethereumXPub(): string {
    const xprv = this.get('crypto.ethereumXPrv');
    if (!xprv.startsWith('xprv')) {
      throw new Error();
    }
    return hdkey.fromExtendedKey(xprv).publicExtendedKey();
  },
};

// tslint:disable:max-classes-per-file

declare module 'ethereumjs-wallet/hdkey' {
  class Wallet {
    public static fromPrivateKey(key: Buffer): Wallet;
    public static fromV3(json: string, password: string): Wallet;
    public getPrivateKey(): Buffer;
    public getPrivateKeyString(): string;
    public getAddressString(): string;
  }

  class EthereumHDKey {
    public privateExtendedKey(): string;
    public publicExtendedKey(): string;
    public derivePath(path: string): EthereumHDKey;
    public deriveChild(index: number): EthereumHDKey;
    public getWallet(): Wallet;
  }

  function fromMasterSeed(seed: Buffer): EthereumHDKey;
  function fromExtendedKey(base58key: string): EthereumHDKey;
}

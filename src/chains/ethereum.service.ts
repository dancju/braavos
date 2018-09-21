// tslint:disable:no-submodule-imports
import { BIP32, fromBase58, fromSeed } from 'bip32';
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import Wallet from 'ethereumjs-wallet';
import { fromExtendedKey } from 'ethereumjs-wallet/hdkey';
import { ConfigService } from 'nestjs-config';
import Web3 from 'web3';
import { Addr } from '../entities/addr.entity';
import { ChainEnum } from './chain.enum';
import { ChainService } from './chain.service';

const { ethereum } = ChainEnum;

export class EthereumService extends ChainService {
  protected readonly prvNode: BIP32;

  constructor(config: ConfigService, web3: Web3) {
    super();
    const seed = config.get('crypto.seed')() as Buffer;
    const xPrv = fromSeed(seed).toBase58();
    const xPub = fromExtendedKey(xPrv).publicExtendedKey();
    if (!xPrv.startsWith('xprv')) {
      throw Error();
    }
    if (!xPub.startsWith('xpub')) {
      throw Error();
    }
    this.prvNode = fromBase58(xPrv);
  }

  public async getAddr(clientId: number, path0: string): Promise<string> {
    const path1 = clientId + `'/` + path0;
    const addr = toChecksumAddress(
      Wallet.fromPublicKey(
        this.prvNode.derivePath(path1).publicKey,
        true,
      ).getAddressString(),
    );
    await Addr.createQueryBuilder()
      .insert()
      .into(Addr)
      .values({
        addr,
        chain: ethereum,
        clientId,
        path: path0,
      })
      .onConflict('("chain", "clientId", "path") DO NOTHING')
      .execute();
    return addr;
  }

  public isValidAddress(addr: string): boolean {
    if (!/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
      return false;
    } else if (/^0x[0-9a-f]{40}$/.test(addr) || /^0x[0-9A-F]{40}$/.test(addr)) {
      return true;
    } else {
      return isValidChecksumAddress(addr);
    }
  }

  protected getPrivateKey(derivePath: string): string {
    return this.prvNode.derivePath(derivePath).toWIF();
  }
}

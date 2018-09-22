// tslint:disable:no-submodule-imports
import { isValidChecksumAddress, toChecksumAddress } from 'ethereumjs-util';
import {
  EthereumHDKey,
  fromExtendedKey,
  fromMasterSeed,
} from 'ethereumjs-wallet/hdkey';
import { ConfigService } from 'nestjs-config';
import { Addr } from '../entities/addr.entity';
import { ChainEnum } from './chain.enum';
import { ChainService } from './chain.service';

const { ethereum } = ChainEnum;

export class EthereumService extends ChainService {
  protected readonly hdkey: EthereumHDKey;

  constructor(config: ConfigService) {
    super();
    const seed = config.get('crypto.seed')() as Buffer;
    this.hdkey = fromMasterSeed(seed);
  }

  public async getAddr(clientId: number, path0: string): Promise<string> {
    const path1 = 'm/' + clientId + `'/` + path0;
    const addr = toChecksumAddress(
      this.hdkey
        .derivePath(path1)
        .getWallet()
        .getAddressString(),
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

  protected getPrivateKey(clientId: number, path0: string): string {
    const path1 = 'm/' + clientId + `'/` + path0;
    return this.hdkey
      .derivePath(path1)
      .getWallet()
      .getPrivateKeyString();
  }
}

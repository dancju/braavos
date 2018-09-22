export abstract class ChainService {
  public abstract getAddr(clientId: number, path: string): Promise<string>;
  public abstract isValidAddress(addr: string): boolean;
  protected abstract _getPrivateKey(path: string): string;
  protected getPrivateKey(clientId: number | string, path0?: string): string {
    if (path0) {
      if (typeof clientId !== 'number' || typeof path0 !== 'string') {
        throw new Error();
      }
      return this._getPrivateKey(clientId + `'/` + path0);
    } else {
      if (typeof clientId !== 'string' || typeof path0 !== 'undefined') {
        throw new Error();
      }
      return this._getPrivateKey(clientId);
    }
  }
}

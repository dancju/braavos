interface ICoinService {
  getAddr(clientId: number, path: string): Promise<string>;
  isValidAddress(addr: string): boolean;
}

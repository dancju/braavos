declare module 'ethereumjs-util' {
  function toChecksumAddress(addr: string): string;
  function isValidChecksumAddress(addr: string): boolean;
}

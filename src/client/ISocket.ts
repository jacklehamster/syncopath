export interface ISocket {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  addEventListener(event: string, listener: (...args: any[]) => void): void;
  removeEventListener(event: string, listener: (...args: any[]) => void): void;
  close(): void;
}

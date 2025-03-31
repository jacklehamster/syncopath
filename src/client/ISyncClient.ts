import { IObservable } from "napl";
import { ISharedData } from "./ISharedData";

export interface ISyncClient extends ISharedData, IObservable {
  readonly self: ISharedData;
  access(path: string): ISharedData;

  peerData(peerId: string): ISharedData;
  removeChildData(path: string): void;

  close(): void;

  onMessageBlob(blob: Blob, skipValidation?: boolean): Promise<void>
  readonly now: number;
}

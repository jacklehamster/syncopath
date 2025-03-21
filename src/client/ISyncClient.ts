import { IObservable } from "./IObservable";
import { ISharedData } from "./ISharedData";
import { Observer } from "./Observer";

export interface ISyncClient extends ISharedData, IObservable {
  readonly self: ISharedData;
  access(path: string): ISharedData;

  peerData(peerId: string): ISharedData;
  removeChildData(path: string): void;

  close(): void;

  // onMessageObject(data: any, onClientIdConfirmed?: () => void, skipValidation?: boolean): void;
  onMessageBlob(blob: Blob, onClientIdConfirmed?: () => void, skipValidation?: boolean): Promise<void>
  triggerObservers(updates: Record<string, any>): void;
  removeObserver(observer: Observer): void;
  readonly now: number;
}

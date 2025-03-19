import { ISharedData, SetDataOptions } from "./ISharedData";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { getLeafObject } from "napl";
import { SyncClient } from "./SyncClient";

export class SubData implements ISharedData, IObservable {
  readonly #parts: (string | number)[] = [];
  readonly #observerManager;

  constructor(readonly path: string, readonly syncClient: SyncClient) {
    this.#parts = path.split("/").map(v => {
      return isNaN(Number(v)) ? v : Number(v);
    });
    this.#observerManager = new ObserverManager(syncClient);
  }

  get clientId(): string {
    return this.syncClient.clientId;
  }

  #getAbsolutePath(path: string): string {
    return path.length ? `${this.path}/${path}` : this.path;
  }

  observe(paths?: (string[] | string)): Observer {
    const multi = Array.isArray(paths);
    const pathArray = paths === undefined ? [] : multi ? paths : [paths];
    const updatedPaths = pathArray.map(path => this.#getAbsolutePath(path));
    return this.#observerManager.observe(updatedPaths, multi);
  }

  triggerObservers(updates: Record<string, any>): void {
    this.#observerManager.triggerObservers(updates);
  }

  async setData(path: string, value: any, options?: SetDataOptions): Promise<void> {
    return this.syncClient.setData(this.#getAbsolutePath(path), value, options);
  }

  async pushData(path: string, value: any, options?: SetDataOptions): Promise<void> {
    return this.syncClient.pushData(this.#getAbsolutePath(path), value, options);
  }

  get state(): Record<string, any> {
    return getLeafObject(this.syncClient.state, this.#parts, 0, false, {
      self: this.syncClient.clientId,
    }) ?? {};
  }

  close() {
    this.#observerManager.close();
    this.syncClient.removeChildData(this.path);
  }
}

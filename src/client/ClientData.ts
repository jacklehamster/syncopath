import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { Observer } from "./Observer";
import { ObserverManager } from "./ObserverManager";
import { SyncClient } from "./SyncClient";

export class ClientData implements ISharedData {
  clientId: string = "";
  readonly #observerManager;

  constructor(readonly syncClient: SyncClient) {
    this.#observerManager = new ObserverManager(syncClient);
  }

  #getAbsolutePath(path: string): string {
    return path ? `clients/~{self}/${path}` : "clients/~{self}";
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

  async pushData(path: string, value: any, options?: UpdateOptions): Promise<void> {
    return this.syncClient.pushData(this.#getAbsolutePath(path), value, options);
  }

  get state() {
    return this.syncClient.state.clients?.[this.clientId] ?? {};
  }
}

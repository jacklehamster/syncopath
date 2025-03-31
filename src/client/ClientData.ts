import { IObservable, Observer } from "napl";
import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { ISyncClient } from "./ISyncClient";

export class ClientData implements ISharedData, IObservable {
  clientId: string = "";

  constructor(readonly syncClient: ISyncClient) {
  }

  #getAbsolutePath(path: string): string {
    return path.length ? `clients/~{self}/${path}` : "clients/~{self}";
  }

  getData(path: string) {
    return this.syncClient.getData(this.#getAbsolutePath(path));
  }

  observe(paths?: (string[] | string)): Observer {
    return this.syncClient.observe(
      paths === undefined ? undefined
        : Array.isArray(paths) ? paths.map(p => this.#getAbsolutePath(p))
          : this.#getAbsolutePath(paths));
  }

  removeObserver(observer: Observer): void {
    this.syncClient.removeObserver(observer);
  }

  setData(path: string, value: any, options?: SetDataOptions): void {
    return this.syncClient.setData(this.#getAbsolutePath(path), value, options);
  }

  pushData(path: string, value: any, options?: UpdateOptions): void {
    return this.syncClient.pushData(this.#getAbsolutePath(path), value, options);
  }

  get state() {
    return this.syncClient.state.clients?.[this.clientId] ?? {};
  }
}

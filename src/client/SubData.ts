import { ISharedData, SetDataOptions } from "./ISharedData";
import { getLeafObject, IObservable, Observer } from "napl";
import { ISyncClient } from "./ISyncClient";

export class SubData implements ISharedData, IObservable {
  readonly #parts: (string | number)[] = [];
  readonly #observers = new Set<Observer>();

  constructor(readonly path: string, readonly syncClient: ISyncClient) {
    this.#parts = path.split("/").map(v => {
      return isNaN(Number(v)) ? v : Number(v);
    });
  }

  getData(path: string) {
    return this.syncClient.getData(this.#getAbsolutePath(path));
  }

  get clientId(): string {
    return this.syncClient.clientId;
  }

  #getAbsolutePath(path: string): string {
    return path.length ? `${this.path}/${path}` : this.path;
  }

  observe(paths?: (string[] | string)): Observer {
    const observer = this.syncClient.observe(
      paths === undefined ? undefined
        : Array.isArray(paths) ? paths.map(p => this.#getAbsolutePath(p))
          : this.#getAbsolutePath(paths));
    this.#observers.add(observer);
    return observer;
  }

  removeObserver(observer: Observer): void {
    this.#observers.delete(observer);
    this.syncClient.removeObserver(observer);
  }

  setData(path: string, value: any, options?: SetDataOptions): void {
    return this.syncClient.setData(this.#getAbsolutePath(path), value, options);
  }

  pushData(path: string, value: any, options?: SetDataOptions): void {
    return this.syncClient.pushData(this.#getAbsolutePath(path), value, options);
  }

  get state(): Record<string, any> {
    return getLeafObject(this.syncClient.state, this.#parts, 0, false, {
      self: this.syncClient.clientId,
    }) ?? {};
  }

  close() {
    this.#observers.forEach(o => this.removeObserver(o));
    this.syncClient.removeChildData(this.path);
  }
}

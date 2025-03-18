import { ISharedData, SetDataOptions } from "./ISharedData";
import { SocketClient } from "./SocketClient";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { getLeafObject } from "napl";

export class SubData implements ISharedData, IObservable {
  readonly #parts: (string | number)[] = [];
  readonly #observerManager;

  constructor(readonly path: string, readonly socketClient: SocketClient) {
    this.#parts = path.split("/");
    this.#observerManager = new ObserverManager(socketClient);
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
    return this.socketClient.setData(this.#getAbsolutePath(path), value, options);
  }

  get state(): Record<string, any> {
    return getLeafObject(this.socketClient.state, this.#parts, 0, false, {
      self: this.socketClient.clientId,
    }) ?? {};
  }

  close() {
    this.#observerManager.close();
    this.socketClient.removeChildData(this.path);
  }
}

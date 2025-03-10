import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions } from "./ISharedData";
import { SocketClient } from "./SocketClient";
import { getLeafObject } from "@/data/data-update";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";

export class SubData implements ISharedData, IObservable {
  readonly #parts: (string | number)[] = [];
  readonly #observerManager;

  constructor(readonly path: Update["path"], readonly socketClient: SocketClient) {
    this.#parts = path.split("/");
    this.#observerManager = new ObserverManager(socketClient);
  }

  #getAbsolutePath(path: Update["path"]): string {
    return path ? `${this.path}/${path}` : this.path;
  }

  observe(...paths: Update["path"][]): Observer {
    const updatedPaths = paths.map(path => this.#getAbsolutePath(path));
    return this.#observerManager.observe(...updatedPaths);
  }

  triggerObservers(): void {
    this.#observerManager.triggerObservers();
  }

  async setData(path: Update["path"], value: any, options?: SetDataOptions): Promise<void> {
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

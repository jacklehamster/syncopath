import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions } from "./ISharedData";
import { SocketClient } from "./SocketClient";
import { Observer } from "./Observer";
import { ObserverManager } from "./ObserverManager";

export class ClientData implements ISharedData {
  id: string = "";
  readonly #observerManager;

  constructor(readonly socketClient: SocketClient) {
    this.#observerManager = new ObserverManager(socketClient);
  }

  #getAbsolutePath(path: Update["path"]): string {
    return path ? `clients/~{self}/${path}` : "clients/~{self}";
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

  get state() {
    return this.socketClient.state.clients?.[this.id] ?? {};
  }
}

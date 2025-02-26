import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions } from "./ISharedData";
import { SocketClient } from "./SocketClient";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";

export class ClientData implements ISharedData, IObservable {
  id: string = "";
  constructor(readonly socketClient: SocketClient) {
  }

  #getAbsolutePath(path: Update["path"]): string {
    return path ? `clients/{self}/${path}` : "clients/{self}";
  }

  observe(...paths: Update["path"][]): Observer {
    const updatedPaths = paths.map(path => this.#getAbsolutePath(path));
    return this.socketClient.observe(...updatedPaths);
  }

  async setData(path: Update["path"], value: any, options?: SetDataOptions): Promise<void> {
    return this.socketClient.setData(this.#getAbsolutePath(path), value, options);
  }

  get state() {
    return this.socketClient.state.clients?.[this.id] ?? {};
  }
}

import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions } from "./ISharedData";
import { SocketClient } from "./SocketClient";
import { getLeafObject } from "@/data/data-update";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";

export class SubData implements ISharedData, IObservable {
  readonly #parts: (string | number)[] = [];
  constructor(readonly path: Update["path"], readonly socketClient: SocketClient) {
    this.#parts = path.split("/");
  }

  #getAbsolutePath(path: Update["path"]): string {
    return path ? `${this.path}/${path}` : this.path;
  }

  observe(...paths: Update["path"][]): Observer {
    const updatedPaths = paths.map(path => this.#getAbsolutePath(path));
    return this.socketClient.observe(...updatedPaths);
  }

  async setData(path: Update["path"], value: any, options?: SetDataOptions): Promise<void> {
    return this.socketClient.setData(this.#getAbsolutePath(path), value, options);
  }

  get state(): Record<string, any> {
    return getLeafObject(this.socketClient.state, this.#parts, 0, false) ?? {};
  }
}

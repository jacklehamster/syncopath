import { Update } from "@/types/Update";
import { Observer } from "./Observer";
import { SocketClient } from "./SocketClient";

export class ObserverManager {
  readonly #observers: Set<Observer> = new Set();

  constructor(private readonly socketClient: SocketClient) {
  }

  observe(paths: Update["path"][], multi: boolean): Observer {
    const observer = new Observer(this.socketClient, paths, this, multi);
    this.#observers.add(observer);
    return observer;
  }

  triggerObservers(updates: Record<string, any>) {
    this.#observers.forEach(o => o.triggerIfChanged(updates));
  }

  removeObserver(observer: Observer) {
    this.#observers.delete(observer);
  }

  close() {
    this.#observers.forEach(o => o.close());
  }
}

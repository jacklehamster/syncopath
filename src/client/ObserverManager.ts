import { Update } from "@/types/Update";
import { Observer } from "./Observer";
import { SocketClient } from "./SocketClient";
import { IObservable } from "./IObservable";

export class ObserverManager implements IObservable {
  readonly #observers: Set<Observer> = new Set();

  constructor(private readonly socketClient: SocketClient) {
  }

  observe(...paths: Update["path"][]): Observer {
    const observer = new Observer(this.socketClient, paths);
    this.#observers.add(observer);
    this.#updateState();
    return observer;
  }

  triggerObservers() {
    this.#observers.forEach(o => o.triggerIfChanged());
  }

  removeObserver(observer: Observer) {
    this.#observers.delete(observer);
    this.#updateState();
  }

  #updateState() {
    this.socketClient.localState.observers = Array.from(new Set(Array.from(this.#observers).map(o => o.paths).flat()));
    this.socketClient.localState.observers.sort();
  }
}

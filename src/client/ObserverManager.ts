import { ISharedData } from "./ISharedData";
import { Observer } from "./Observer";

export class ObserverManager {
  readonly #observers = new Set<Observer>();

  constructor(private readonly sharedData: ISharedData) {
  }

  observe(paths: string[], multi: boolean): Observer {
    const observer = new Observer(this.sharedData, paths, this, multi);
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

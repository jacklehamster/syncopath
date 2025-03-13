import { Update } from "@/types/Update";
import { SocketClient } from "./SocketClient";
import { ObserverManager } from "./ObserverManager";
import { getLeafObject } from "napl";

export class Observer {
  readonly #partsArrays: (string | number)[][];
  #previousValues: any[] = [];
  readonly #changeCallbacks: Set<(values: any | any[], previous: any | any[]) => void> = new Set();
  readonly #addedElementsCallback: Set<(keys: any | (any[] | undefined)[]) => void> = new Set();
  readonly #deletedElementsCallback: Set<(keys: any | (any[] | undefined)[]) => void> = new Set();
  constructor(
    readonly socketClient: SocketClient,
    readonly paths: Update["path"][],
    readonly observerManagger: ObserverManager,
    readonly multiValues: boolean = false) {
    this.#partsArrays = paths.map(p => p === undefined ? [] : p.split("/"));
    this.#previousValues = paths.map(() => undefined);
    requestAnimationFrame(() => this.triggerIfChanged());
  }

  onChange(callback: (values: any | any[], previous: any | any[]) => void): Observer {
    this.#changeCallbacks.add(callback);
    return this;
  }

  onElementsAdded(callback: (keys: any | (any[] | undefined)[]) => void): Observer {
    this.#addedElementsCallback.add(callback);
    return this;
  }

  onElementsDeleted(callback: (keys: any | (any[] | undefined)[]) => void): Observer {
    this.#deletedElementsCallback.add(callback);
    return this;
  }

  #valuesChanged() {
    const newValues = this.#partsArrays.map(parts =>
      getLeafObject(this.socketClient.state, parts, 0, false, { self: this.socketClient.clientId })
    );

    if (this.#previousValues.length && this.#previousValues.every((prev, index) => {
      const newValue = newValues[index];
      if (prev === newValue) {
        return true;
      }
      if (Array.isArray(prev) && Array.isArray(newValue)
        && prev.length === newValue.length
        && prev.every((elem, idx) => elem === newValue[idx])) {
        return true;
      }
      return false;
    })) {
      return null;
    }

    return newValues;
  }

  triggerIfChanged() {
    const newValues = this.#valuesChanged();
    if (!newValues) {
      return;
    }
    const previousValues = this.#previousValues;
    this.#previousValues = newValues;

    this.#changeCallbacks.forEach(callback => callback(this.multiValues ? newValues : newValues[0], this.multiValues ? previousValues : previousValues[0]));
    if (this.#addedElementsCallback && newValues.some((val) => Array.isArray(val))) {
      let hasNewElements = false;
      const newElementsArray = newValues.map((val, index) => {
        if (Array.isArray(val)) {
          const previousSet = new Set(Array.isArray(previousValues[index]) ? previousValues[index] : []);
          const newElements = val.filter((clientId) => !previousSet.has(clientId));
          if (newElements.length) {
            hasNewElements = true;
          }
          return newElements;
        }
      });
      if (hasNewElements) {
        this.#addedElementsCallback.forEach(callback => callback(this.multiValues ? newElementsArray : newElementsArray[0]));
      }
    }
    if (this.#deletedElementsCallback && previousValues.some((val) => Array.isArray(val))) {
      let hasDeletedElements = false;
      const deletedElementsArray = previousValues.map((prev, index) => {
        if (Array.isArray(prev)) {
          const currentSet = new Set(Array.isArray(newValues[index]) ? newValues[index] : []);
          const deletedElements = prev.filter((clientId) => !currentSet.has(clientId));
          if (deletedElements.length) {
            hasDeletedElements = true;
          }
          return deletedElements;
        }
      });
      if (hasDeletedElements) {
        this.#deletedElementsCallback.forEach(callback => callback(this.multiValues ? deletedElementsArray : deletedElementsArray[0]));
      }
    }
  }

  close(): void {
    this.observerManagger.removeObserver(this);
  }
}

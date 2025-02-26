// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { commitUpdates, getLeafObject, markCommonUpdateConfirmed } from "@/data/data-update";
import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions } from "./ISharedData";
import { ClientData } from "./ClientData";
import { SubData } from "./SubData";
import { Observer } from "./Observer";
import { BlobBuilder, extractPayload } from "@dobuki/data-blob";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { extractBlobsFromPayload } from "@dobuki/data-blob";

const LOCAL_TAG = "$-local";

export class SocketClient implements ISharedData, IObservable {
  state: Record<string, any> = {
    [LOCAL_TAG]: {},
  };
  #socket: WebSocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #connectionUrl: string;
  readonly #outgoingUpdates: Update[] = [];
  readonly #incomingUpdates: Update[] = [];
  readonly #selfData: ClientData = new ClientData(this);
  readonly #observerManager = new ObserverManager(this);
  #serverTimeOffset = 0;

  constructor(host: string, room?: string) {
    const prefix = host.startsWith("ws://") || host.startsWith("wss://") ? "" : globalThis.location.protocol === "https:" ? "wss://" : "ws://";
    this.#connectionUrl = `${prefix}${host}${room ? `?room=${room}` : ""}`;
    this.#connect();
    globalThis.addEventListener("focus", () => {
      if (!this.#socket) {
        this.#connect();
      }
    });
  }

  #fixPath(path: Update["path"]) {
    const split = path.split("/");
    return split.map(part => part === "{self}" ? this.#selfData.id : part).join("/");
  }

  #usefulUpdate(update: Update) {
    const currentValue = this.getData(update.path);
    return update.value !== currentValue;
  }

  getData(path: Update["path"]) {
    return getLeafObject(this.state, path, 0, false, this.#selfData.id) as any;
  }

  async setData(path: Update["path"], value: any, options?: SetDataOptions) {
    await this.#waitForConnection();

    if (typeof value === "function") {
      const updater = value as (prev: any) => any;
      value = updater(this.getData(path));
    }

    const payloadBlobs: Record<string, Blob> = {};
    value = await extractBlobsFromPayload(value, payloadBlobs);

    const update: Update = {
      path: this.#fixPath(path),
      value: options?.delete ? undefined : value,
      push: options?.push,
      insert: options?.insert,
      blobs: payloadBlobs,
    };

    if (!options?.passive) {
      markCommonUpdateConfirmed(update, this.serverTime);
    }
    if (!this.#usefulUpdate(update)) {
      return;
    }

    //  commit updates locally
    if (!options?.passive) {
      this.#queueIncomingUpdates(update);
    }
    this.#queueOutgoingUpdates(update);
  }

  get clientId() {
    return this.#selfData.id;
  }

  get self(): ISharedData {
    return this.#selfData;
  }

  access(path: Update["path"]): SubData {
    return new SubData(path, this);
  }

  observe(...paths: Update["path"][]): Observer {
    return this.#observerManager.observe(...paths);
  }

  async #waitForConnection() {
    if (!this.#socket) {
      this.#connect();
    }
    return this.#connectionPromise;
  }

  async #connect() {
    const socket = this.#socket = new WebSocket(this.#connectionUrl);
    return this.#connectionPromise = new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        console.log("Connected to WebSocket server", this.#connectionUrl);
      });
      socket.addEventListener("error", (event) => {
        console.error("Error connecting to WebSocket server", event);
        reject(event);
      });

      socket.addEventListener("message", async (event: MessageEvent<Blob>) => {
        const { payload, ...blobs } = await extractPayload(event.data);

        if (payload?.serverTime) {
          this.#serverTimeOffset = payload.serverTime - Date.now();
        }
        if (payload?.myClientId) {
          // client ID confirmed
          this.#selfData.id = payload.myClientId;
          this.#connectionPromise = undefined;
          this.localState.id = payload.myClientId;
          resolve();
        }
        if (payload?.state) {
          this.state = { ...payload.state, [LOCAL_TAG]: this.state[LOCAL_TAG] };
          this.state.blobs = blobs;
        }
        if (payload?.updates) {
          const updates: Update[] = payload.updates;
          updates.forEach(update => {
            const updateBlobs = update.blobs ?? {};
            Object.keys(updateBlobs).forEach(key => updateBlobs[key] = blobs[key]);
          });
          this.#queueIncomingUpdates(...payload.updates);
        }
        this.#observerManager.triggerObservers();
      });

      socket.addEventListener("close", () => {
        console.log("Disconnected from WebSocket server");
        this.#socket = undefined;
        this.#selfData.id = "";
      });
    });
  }

  nextFrameInProcess = false;
  #prepareNextFrame() {
    if (this.nextFrameInProcess) {
      return;
    }
    this.nextFrameInProcess = true;
    requestAnimationFrame(() => this.#processNextFrame());
  }

  #processNextFrame() {
    this.nextFrameInProcess = false;
    if (this.#incomingUpdates.length) {
      this.#applyUpdates();
    }
    if (this.#outgoingUpdates.length) {
      this.#broadcastUpdates();
    }
  }

  #queueOutgoingUpdates(...updates: Update[]) {
    this.#prepareNextFrame();
    this.#outgoingUpdates.push(...updates);
  }

  #queueIncomingUpdates(...updates: Update[]) {
    this.#prepareNextFrame();
    this.#incomingUpdates.push(...updates);
  }

  async #broadcastUpdates() {
    await this.#waitForConnection();
    const blobBuilder = BlobBuilder.payload("payload", { updates: this.#outgoingUpdates });
    const addedBlob = new Set<string>();
    this.#outgoingUpdates.forEach(update => {
      Object.entries(update.blobs ?? {}).forEach(([key, blob]) => {
        if (!addedBlob.has(key)) {
          blobBuilder.blob(key, blob);
          addedBlob.add(key);
        }
      });
    });
    this.#socket?.send(blobBuilder.build());
    this.#outgoingUpdates.length = 0;
  }

  #saveBlobsFromUpdates(updates: Update[]) {
    updates.forEach(update => Object.entries(update.blobs ?? {}).forEach(([key, blob]) => {
      this.state.blobs[key] = blob;
    }));
  }

  #applyUpdates() {
    this.#saveBlobsFromUpdates(this.#incomingUpdates);
    commitUpdates(this.state, this.#incomingUpdates);
    this.#incomingUpdates.length = 0;
    this.#observerManager.triggerObservers();
  }

  removeObserver(observer: Observer) {
    this.#observerManager.removeObserver(observer);
  }

  get localState() {
    return this.state[LOCAL_TAG];
  }

  get serverTime() {
    return Date.now() + this.#serverTimeOffset;
  }
}

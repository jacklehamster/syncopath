// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { ClientData } from "./ClientData";
import { SubData } from "./SubData";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { checkPayload, extractBlobsFromPayload, extractPayload, includeBlobsInPayload } from "@dobuki/data-blob";
import { PeerManager } from "./peer/PeerManager";
import { checkPeerConnections } from "./peer/check-peer";
import { RoomState } from "@/types/RoomState";
import { applyUpdates, getLeafObject, markUpdateConfirmed, packageUpdates, pushUpdate, translateValue, Update } from "napl";
import { ISocket } from "./ISocket";

type socketProvider = () => ISocket;

export class SyncClient implements ISharedData, IObservable {
  readonly state: RoomState;
  readonly #children: Map<string, ISharedData> = new Map();
  #socket: ISocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #outgoingUpdates: (Update | undefined)[] = [];
  readonly #selfData: ClientData = new ClientData(this);
  readonly #observerManager = new ObserverManager(this);
  readonly peerManagers: Record<string, PeerManager> = {};
  #serverTimeOffset = 0;
  #nextFrameInProcess = false;
  #secret = "";

  constructor(private socketProvider: socketProvider, initialState: RoomState = {}) {
    this.state = initialState;
    this.#connect();
    globalThis.addEventListener("focus", () => {
      if (!this.#socket) {
        const autoReconnect = this.state.config?.autoReconnect ?? true;
        if (autoReconnect) {
          this.#connect().catch(e => {
            console.warn("Failed to reconnect");
          });
        }
      }
    });
    this.#children.set(`clients/~{self}`, this.#selfData);
  }

  getData(path: string) {
    const parts = path.split("/");
    return getLeafObject(this.state, parts, 0, false, { self: this.#selfData.clientId }) as any;
  }

  async pushData(path: string, value: any, options: UpdateOptions = {}) {
    const val = await this.#convertValue(path, value);

    await this.#applyUpdate({
      path: this.#fixPath(path),
      value: val,
      append: true,
    }, options);
  }

  async setData(path: string, value: any, options: SetDataOptions = {}) {
    const val = await this.#convertValue(path, value);

    await this.#applyUpdate({
      path: this.#fixPath(path),
      value: options.delete ? undefined : val,
      append: options.append,
      insert: options.insert,
    }, options);
  }

  async #convertValue(path: string, value: any) {
    if (typeof value === "function") {
      const updater = value as (prev: any) => any;
      value = updater(this.getData(path));
    }
    return value;
  }

  async #applyUpdate(update: Update, options: UpdateOptions = {}) {
    if (!this.#usefulUpdate(update)) {
      return;
    }
    const isPeerUpdate = this.#isPeerUpdate(update);
    if (!isPeerUpdate) {
      await this.#waitForConnection();
    }
    const active = options.active ?? this.state.config?.activeUpdates ?? false;

    if (active || isPeerUpdate) {
      markUpdateConfirmed(update, this.now);
    }

    //  commit updates locally
    if (update.confirmed) {
      this.#queueIncomingUpdates(update);
    }
    this.#queueOutgoingUpdates(update);
  }

  get clientId() {
    return this.#selfData.clientId;
  }

  get self(): ISharedData {
    return this.#selfData;
  }

  access(path: string): ISharedData {
    const childData = this.#children.get(path);
    if (childData) {
      return childData;
    }
    const subData = new SubData(path, this);
    this.#children.set(path, subData);
    return subData;
  }

  peerData(peerId: string): ISharedData {
    const peerTag = [this.clientId, peerId].sort().join(":");
    return this.access(`peer/${peerTag}`);
  }

  removeChildData(path: string) {
    this.#children.delete(path);
  }

  observe(paths?: (string[] | string)): Observer {
    const multi = Array.isArray(paths);
    const pathArray = paths === undefined ? [] : multi ? paths : [paths];
    return this.#observerManager.observe(pathArray, multi);
  }

  async #waitForConnection() {
    if (!this.#socket) {
      this.#connect();
    }
    return this.#connectionPromise;
  }

  async #connect() {
    const socket = this.#socket = this.socketProvider();
    return this.#connectionPromise = new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        console.log("SyncClient connection opened");
      });
      socket.addEventListener("error", (event) => {
        console.error("SyncClient connection error", event);
        reject(event);
      });

      socket.addEventListener("message", async (event: MessageEvent<Blob>) => {
        this.onMessageBlob(event.data, resolve);
      });

      socket.addEventListener("close", () => {
        console.log("Disconnected from SyncClient");
        this.#socket = undefined;
      });
    });
  }

  closeSocket() {
    this.#socket?.close();
  }

  async onMessageBlob(blob: Blob, onClientIdConfirmed?: () => void, skipValidation: boolean = false) {
    const { payload, ...blobs } = await extractPayload(blob);
    const secret = payload?.secret ?? this.#secret;
    if (!skipValidation && !checkPayload(payload, secret)) {
      console.error("Failed payload validation.");
      return;
    }

    const hasBlobs = Object.keys(blobs).length > 0;

    if (payload?.secret) {
      this.#secret = payload.secret;
    }
    if (payload?.serverTime) {
      this.#serverTimeOffset = payload.serverTime - Date.now();
    }
    if (payload?.myClientId) {
      // client ID confirmed
      this.#selfData.clientId = payload.myClientId;
      this.#connectionPromise = undefined;
      onClientIdConfirmed?.();
    }
    if (payload?.state) {
      delete payload.state.signature;
      for (const key in payload.state) {
        this.state[key] = hasBlobs ? includeBlobsInPayload(payload.state[key], blobs) : payload.state[key];
      }
    }
    if (payload?.updates) {
      if (hasBlobs) {
        payload.updates.forEach((update: Update) => {
          update.value = includeBlobsInPayload(update.value, blobs);
        });
      }
      this.#queueIncomingUpdates(...payload.updates);
    }
    if (payload?.state && !payload?.updates?.length) {
      this.triggerObservers({});
    }
  }

  triggerObservers(updates: Record<string, any>): void {
    this.#observerManager.triggerObservers(updates);
    this.#children.forEach(child => child.triggerObservers(updates));
  }

  removeObserver(observer: Observer) {
    this.#observerManager.removeObserver(observer);
  }

  get now() {
    return Date.now() + this.#serverTimeOffset;
  }

  #prepareNextFrame() {
    if (this.#nextFrameInProcess) {
      return;
    }
    this.#nextFrameInProcess = true;
    requestAnimationFrame(() => this.#processNextFrame());
  }

  #processNextFrame() {
    this.#nextFrameInProcess = false;
    const updates = applyUpdates(this.state, {
      now: this.now,
      self: this.clientId,
    });
    if (updates) {
      this.triggerObservers(updates);
      checkPeerConnections(this);
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
    pushUpdate(this.state, ...updates);
  }

  async #broadcastUpdates() {
    const blobs: Record<string, Blob> = {};
    for (let update of this.#outgoingUpdates) {
      if (update) {
        update.value = await extractBlobsFromPayload(update.value, blobs);
      }
    }

    this.#outgoingUpdates.forEach((update, index) => {
      // skip updates to peers if there's a peerManager ready
      if (update?.path?.startsWith("peer/")) {
        const tag = update.path.split("/")[1];
        const clientIds = tag.split(":");
        if (clientIds.length === 2) {
          const peerId = clientIds[0] === this.clientId ? clientIds[1] : clientIds[0];
          if (this.peerManagers[peerId]?.ready) {
            //  Send through peer manager
            this.peerManagers[peerId].send(packageUpdates([{ ...update }], blobs));
            this.#outgoingUpdates[index] = undefined;
            return false;
          }
        }
      }
    });

    const outUpdates = this.#outgoingUpdates.filter(update => !!update);
    this.#outgoingUpdates.length = 0;
    if (outUpdates.length) {
      await this.#waitForConnection();
      const blob = packageUpdates(outUpdates, blobs, this.#secret);
      this.#socket?.send(blob);
    }
  }

  #isPeerUpdate(update: Update) {
    if (update.path?.startsWith("peer/")) {
      const tag = update.path.split("/")[1];
      const clientIds = tag.split(":");
      return clientIds.length === 2 && (clientIds[0] === this.clientId || clientIds[1] === this.clientId);
    }
    return false;
  }

  #fixPath(path: string) {
    const split = path.split("/");
    return split.map(part => translateValue(part, {
      self: this.#selfData.clientId,
    })).join("/");
  }

  #usefulUpdate(update: Update) {
    const currentValue = this.getData(update.path);
    return update.value !== currentValue;
  }
}

// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { commitUpdates, getLeafObject, markUpdateConfirmed, translateValue } from "@/data/data-update";
import { Update } from "@/types/Update";
import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { ClientData } from "./ClientData";
import { SubData } from "./SubData";
import { Observer } from "./Observer";
import { BlobBuilder, extractPayload } from "@dobuki/data-blob";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { extractBlobsFromPayload } from "@dobuki/data-blob";
import { PeerManager } from "./peer/PeerManager";
import { checkPeerConnections } from "./peer/check-peer";
import { RoomState } from "@/types/RoomState";
import { signedPayload } from "@dobuki/payload-validator";

export class SocketClient implements ISharedData, IObservable {
  readonly state: RoomState;
  readonly #children: Map<string, ISharedData> = new Map();
  #socket: WebSocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #connectionUrl: string;
  readonly #outgoingUpdates: (Update | undefined)[] = [];
  readonly #selfData: ClientData = new ClientData(this);
  readonly #observerManager = new ObserverManager(this);
  readonly peerManagers: Record<string, PeerManager> = {};
  #serverTimeOffset = 0;
  #nextFrameInProcess = false;
  #secret?: string;

  constructor(host: string, room?: string, initialState: RoomState = {}) {
    this.state = initialState;
    const prefix = host.startsWith("ws://") || host.startsWith("wss://") ? "" : globalThis.location.protocol === "https:" ? "wss://" : "ws://";
    this.#connectionUrl = `${prefix}${host}${room ? `?room=${room}` : ""}`;
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

  #fixPath(path: Update["path"]) {
    const split = path.split("/");
    return split.map(part => translateValue(part, {
      self: this.#selfData.id,
    })).join("/");
  }

  #usefulUpdate(update: Update) {
    const currentValue = this.getData(update.path);
    return update.value !== currentValue;
  }

  getData(path: Update["path"]) {
    const parts = path.split("/");
    return getLeafObject(this.state, parts, 0, false, { self: this.#selfData.id }) as any;
  }

  async #convertValue(path: Update["path"], value: any) {
    if (typeof value === "function") {
      const updater = value as (prev: any) => any;
      value = updater(this.getData(path));
    }
    const payloadBlobs: Record<string, Blob> = {};
    value = await extractBlobsFromPayload(value, payloadBlobs);
    return [value, payloadBlobs];
  }

  async pushData(path: Update["path"], value: any, options: UpdateOptions = {}) {
    const [val, payloadBlobs] = await this.#convertValue(path, value);

    await this.applyUpdate({
      path: this.#fixPath(path),
      value: val,
      append: true,
      blobs: payloadBlobs,
    }, options);
  }

  async setData(path: Update["path"], value: any, options: SetDataOptions = {}) {
    const [val, payloadBlobs] = await this.#convertValue(path, value);

    await this.applyUpdate({
      path: this.#fixPath(path),
      value: options.delete ? undefined : val,
      append: options.append,
      insert: options.insert,
      blobs: payloadBlobs,
    }, options);
  }

  async applyUpdate(update: Update, options: UpdateOptions = {}) {
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
    return this.#selfData.id;
  }

  get self(): ISharedData {
    return this.#selfData;
  }

  access(path: Update["path"]): ISharedData {
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

  observe(paths?: (Update["path"][] | Update["path"])): Observer {
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
        this.processDataBlob(event.data, resolve);
      });

      socket.addEventListener("close", () => {
        console.log("Disconnected from WebSocket server");
        this.#socket = undefined;
      });
    });
  }

  closeSocket() {
    this.#socket?.close();
  }

  async processDataBlob(blob: Blob, onClientIdConfirmed?: () => void) {
    const { payload, ...blobs } = await extractPayload(blob);

    if (payload?.secret) {
      this.#secret = payload.secret;
    }
    if (payload?.serverTime) {
      this.#serverTimeOffset = payload.serverTime - Date.now();
    }
    if (payload?.myClientId) {
      // client ID confirmed
      this.#selfData.id = payload.myClientId;
      this.#connectionPromise = undefined;
      onClientIdConfirmed?.();
    }
    if (payload?.state) {
      for (const key in payload.state) {
        this.state[key] = payload.state[key];
      }
      if (Object.keys(blobs).length) {
        this.state.blobs = blobs;
      }
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
    if (this.state.updates?.length) {
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
    if (!this.state.updates) {
      this.state.updates = [];
    }
    this.state.updates.push(...updates);
  }

  async #broadcastUpdates() {
    this.#outgoingUpdates.forEach((update, index) => {
      // skip updates to peers if there's a peerManager ready
      if (update?.path?.startsWith("peer/")) {
        const tag = update.path.split("/")[1];
        const clientIds = tag.split(":");
        if (clientIds.length === 2) {
          const peerId = clientIds[0] === this.clientId ? clientIds[1] : clientIds[0];
          if (this.peerManagers[peerId]?.ready) {
            //  Send through peer manager
            this.peerManagers[peerId].send(this.#packageUpdates([{ ...update }]));
            this.#outgoingUpdates[index] = undefined;
            return false;
          }
        }
      }
    });

    const outUpdates = this.#outgoingUpdates
      .filter(update => !!update)
      .map(update => signedPayload(update, { secret: this.#secret }));
    if (outUpdates.length) {
      await this.#waitForConnection();
      const blob = this.#packageUpdates(outUpdates);
      this.#socket?.send(blob);
    }
    this.#outgoingUpdates.length = 0;
  }

  #packageUpdates(updates: Update[]): Blob {
    const blobBuilder = BlobBuilder.payload("payload", { updates });
    const addedBlob = new Set<string>();
    updates.forEach(update => {
      Object.entries(update?.blobs ?? {}).forEach(([key, blob]) => {
        if (!addedBlob.has(key)) {
          blobBuilder.blob(key, blob);
          addedBlob.add(key);
        }
      });
    });
    return blobBuilder.build();
  }

  #saveBlobsFromUpdates(updates?: Update[]) {
    updates?.forEach(update => Object.entries(update.blobs ?? {}).forEach(([key, blob]) => {
      const blobs = this.state.blobs ?? (this.state.blobs = {});
      blobs[key] = blob;
    }));
  }

  #applyUpdates() {
    this.#saveBlobsFromUpdates(this.state.updates);
    commitUpdates(this.state, {
      now: this.now,
    });
    this.triggerObservers();
    checkPeerConnections(this);
  }

  #isPeerUpdate(update: Update) {
    if (update.path?.startsWith("peer/")) {
      const tag = update.path.split("/")[1];
      const clientIds = tag.split(":");
      return clientIds.length === 2 && (clientIds[0] === this.clientId || clientIds[1] === this.clientId);
    }
    return false;
  }

  triggerObservers(): void {
    this.#observerManager.triggerObservers();
    this.#children.forEach(child => child.triggerObservers());
  }

  removeObserver(observer: Observer) {
    this.#observerManager.removeObserver(observer);
  }

  get now() {
    return Date.now() + this.#serverTimeOffset;
  }
}

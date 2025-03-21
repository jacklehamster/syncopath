// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { ClientData } from "./ClientData";
import { SubData } from "./SubData";
import { Observer } from "./Observer";
import { IObservable } from "./IObservable";
import { ObserverManager } from "./ObserverManager";
import { PeerManager } from "./peer/PeerManager";
import { RoomState } from "@/types/RoomState";
import { getLeafObject, markUpdateConfirmed, Processor, Update } from "napl";
import { ISocket } from "./ISocket";
import { ISyncClient } from "./ISyncClient";

export type SocketProvider = () => Promise<ISocket>;

export class SyncClient implements ISharedData, IObservable, ISyncClient {
  readonly state: RoomState;
  readonly #children: Map<string, ISharedData> = new Map();
  #socket: ISocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #selfData: ClientData = new ClientData(this);
  readonly #observerManager = new ObserverManager(this);
  readonly peerManagers: Record<string, PeerManager> = {};
  #serverTimeOffset = 0;
  #nextFrameInProcess = false;
  #secret?: string;
  readonly #processor: Processor = new Processor((blob) => this.#socket?.send(blob));

  constructor(private socketProvider: SocketProvider, initialState: RoomState = {}) {
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
    await this.#processDataUpdate({
      path,
      value,
      append: true,
    }, options);
  }

  async setData(path: string, value: any, options: SetDataOptions = {}) {
    await this.#processDataUpdate({
      path,
      value,
      append: options.append,
      insert: options.insert,
    }, options);
  }

  async #processDataUpdate(update: Update, options: UpdateOptions = {}) {
    const isPeerUpdate = this.#isPeerUpdate(update);
    if (!isPeerUpdate) {
      await this.#waitForConnection();
    }
    if (options.active ?? this.state.config?.activeUpdates ?? this.#socket?.serverless) {
      markUpdateConfirmed(update, this.now);
    }
    this.state.outgoingUpdates = this.state.outgoingUpdates ?? [];
    this.state.outgoingUpdates.push(update);
    this.#prepareNextFrame();
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
    const socket = this.#socket = await this.socketProvider();
    return this.#connectionPromise = new Promise<void>((resolve, reject) => {
      socket.onError((event) => {
        console.error("SyncClient connection error", event);
        reject(event);
      });
      socket.onMessage((data) => {
        this.onMessageBlob(data, resolve);
      });
      socket.onClose(() => {
        console.log("Disconnected from SyncClient");
        this.#socket = undefined;
      });
    });
  }

  close() {
    this.#socket?.close();
  }

  // onMessageObject(data: any, onClientIdConfirmed?: () => void, skipValidation = false) {
  //   return this.#onMessage(data, undefined, onClientIdConfirmed, skipValidation);
  // }

  async onMessageBlob(blob: any, onClientIdConfirmed?: () => void, skipValidation: boolean = false) {
    const context = {
      root: this.state,
      secret: this.#secret,
      clientId: this.clientId,
      localTimeOffset: this.#serverTimeOffset,
      properties: {
        self: this.clientId,
        now: this.now,
      },
      skipValidation,
    };
    const preClient = context.clientId;
    await this.#processor.processBlob(blob, context);
    this.#serverTimeOffset = context.localTimeOffset;
    this.#secret = context.secret;

    if (!preClient && context.clientId) {
      this.#selfData.clientId = context.clientId;
      onClientIdConfirmed?.();
    }

    this.#prepareNextFrame();
  }

  // #onMessage(payload: Payload, blobs?: Record<string, Blob>, onClientIdConfirmed?: () => void, skipValidation: boolean = false) {
  //   const secret = this.#secret ?? payload?.secret;
  //   if (!skipValidation && secret && !checkPayload(payload, secret)) {
  //     console.error("Failed payload validation.");
  //     return;
  //   }

  //   const hasBlobs = blobs && Object.keys(blobs).length > 0;

  //   if (payload?.secret) {
  //     this.#secret = payload.secret;
  //   }
  //   if (payload?.serverTime) {
  //     this.#serverTimeOffset = payload.serverTime - Date.now();
  //   }
  //   if (payload?.myClientId) {
  //     // client ID confirmed
  //     this.#selfData.clientId = payload.myClientId;
  //     this.#connectionPromise = undefined;
  //     onClientIdConfirmed?.();
  //   }
  //   if (payload?.state) {
  //     delete payload.state.signature;
  //     for (const key in payload.state) {
  //       this.state[key] = hasBlobs ? includeBlobsInPayload(payload.state[key], blobs) : payload.state[key];
  //     }
  //   }
  //   if (payload?.updates) {
  //     if (hasBlobs) {
  //       payload.updates.forEach((update: Update) => {
  //         update.value = includeBlobsInPayload(update.value, blobs);
  //       });
  //     }
  //     this.#queueIncomingUpdates(...payload.updates);
  //   }
  //   if (payload?.state && !payload?.updates?.length) {
  //     this.triggerObservers({});
  //   }
  // }

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
    const context = {
      root: this.state,
      secret: this.#secret,
      clientId: this.clientId,
      localTimeOffset: this.#serverTimeOffset,
      properties: {
        self: this.clientId,
        now: this.now,
      },
    };
    const updates = this.#processor.performCycle(context);
    this.#selfData.clientId = context.clientId;
    this.#serverTimeOffset = context.localTimeOffset;
    this.#secret = context.secret;

    // if (Object.keys(updates).length) {
    this.triggerObservers(updates);
    // checkPeerConnections(this);
    // }
    this.#socket?.stateChanged?.(this.state);
  }

  //   this.#outgoingUpdates.forEach((update, index) => {
  //     // skip updates to peers if there's a peerManager ready
  //     if (update?.path?.startsWith("peer/")) {
  //       const tag = update.path.split("/")[1];
  //       const clientIds = tag.split(":");
  //       if (clientIds.length === 2) {
  //         const peerId = clientIds[0] === this.clientId ? clientIds[1] : clientIds[0];
  //         if (this.peerManagers[peerId]?.ready) {
  //           //  Send through peer manager
  //           this.peerManagers[peerId].send(packageUpdates([{ ...update }], blobs));
  //           this.#outgoingUpdates[index] = undefined;
  //           return false;
  //         }
  //       }
  //     }
  //   });

  //   const outUpdates = this.#outgoingUpdates.filter(update => !!update);
  //   this.#outgoingUpdates.length = 0;
  //   if (outUpdates.length) {
  //     await this.#waitForConnection();
  //     if (this.#socket?.supportBlob && Object.keys(blobs).length) {
  //       this.#socket?.send(packageUpdates(outUpdates, blobs, this.#secret));
  //     } else {
  //       this.#socket?.send(JSON.stringify(signedPayload({ updates: outUpdates }, { secret: this.#secret })));
  //     }
  //   }
  // }

  #isPeerUpdate(update: Update) {
    if (update.path?.startsWith("peer/")) {
      const tag = update.path.split("/")[1];
      const clientIds = tag.split(":");
      return clientIds.length === 2 && (clientIds[0] === this.clientId || clientIds[1] === this.clientId);
    }
    return false;
  }
}

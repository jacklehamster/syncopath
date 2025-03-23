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
import { Context, getLeafObject, markUpdateConfirmed, Processor, Update } from "napl";
import { ISocket } from "./ISocket";
import { ISyncClient } from "./ISyncClient";
import { checkPeerConnections } from "./peer/check-peer";

export type SocketProvider = () => Promise<ISocket>;

export class SyncClient implements ISharedData, IObservable, ISyncClient {
  readonly state: RoomState;
  readonly #children: Map<string, ISharedData> = new Map();
  #socket: ISocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #selfData: ClientData = new ClientData(this);
  readonly #observerManager = new ObserverManager(this);
  readonly peerManagers: Record<string, PeerManager> = {};
  #localTimeOffset = 0;
  #nextFrameInProcess = false;
  #secret?: string;
  readonly #processor: Processor = new Processor((blob) => this.#socket?.send(blob));
  #outgoingUpdates: (Update | undefined)[] = [];
  #closeListener = () => { };

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

  onClose(listener: () => void) {
    this.#closeListener = listener;
  }

  getData(path: string) {
    const parts = path.split("/");
    return getLeafObject(this.state, parts, 0, false, { self: this.#selfData.clientId }) as any;
  }

  pushData(path: string, value: any, options: UpdateOptions = {}) {
    this.#processDataUpdate({
      path,
      value,
      append: true,
    }, options);
  }

  setData(path: string, value: any, options: SetDataOptions = {}) {
    this.#processDataUpdate({
      path,
      value,
      append: options.append,
      insert: options.insert,
    }, options);
  }

  #processDataUpdate(update: Update, options: UpdateOptions = {}) {
    if (options.active ?? this.state.config?.activeUpdates ?? this.#socket?.serverless) {
      markUpdateConfirmed(update, this.now);
    }
    this.#outgoingUpdates.push(update);
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
      socket.onMessage(async (data) => {
        const preClientId = this.clientId;
        await this.onMessageBlob(data);
        if (!preClientId && this.clientId) {
          resolve();
        }
      });
      socket.onClose(() => {
        console.log(this.clientId, "disconnected from SyncClient");
        this.#socket = undefined;
        this.#closeListener();
      });
    });
  }

  close() {
    this.#socket?.close();
  }

  async onMessageBlob(blob: any, skipValidation: boolean = false) {
    const context = {
      root: this.state,
      secret: this.#secret,
      clientId: this.clientId,
      localTimeOffset: this.#localTimeOffset,
      properties: {
        self: this.clientId,
        now: this.now,
      },
      skipValidation: skipValidation || this.state.config?.signPayloads === false,
    };
    await this.#processor.processBlob(blob, context);

    this.#localTimeOffset = context.localTimeOffset;
    this.#secret = context.secret;
    this.#selfData.clientId = context.clientId;

    this.#prepareNextFrame();
  }

  triggerObservers(updates: Record<string, any>): void {
    this.#observerManager.triggerObservers(updates);
    this.#children.forEach(child => child.triggerObservers(updates));
  }

  removeObserver(observer: Observer) {
    this.#observerManager.removeObserver(observer);
  }

  get now() {
    return Date.now() + this.#localTimeOffset;
  }

  #prepareNextFrame() {
    if (this.#nextFrameInProcess) {
      return;
    }
    this.#nextFrameInProcess = true;
    requestAnimationFrame(() => {
      this.#nextFrameInProcess = false;
      this.#processNextFrame();
    });
  }

  async #processNextFrame() {
    if (this.#outgoingUpdates.some(update => !update?.path.startsWith("peer/"))) {
      await this.#waitForConnection();
    }
    this.#outgoingUpdates.forEach((update, index) => {
      // skip updates to peers if there's a peerManager ready
      if (update?.path.startsWith("peer/")) {
        const tag = update.path.split("/")[1];
        const clientIds = tag.split(":");
        if (clientIds.length === 2) {
          const peerId = clientIds[0] === this.clientId ? clientIds[1] : clientIds[0];
          if (this.peerManagers[peerId]?.ready) {
            this.#outgoingUpdates[index] = undefined;
            //  Mark peer updates as confirmed
            update.confirmed = this.now;
            //  Send through peer manager
            const context: Context = {
              root: this.state,
              secret: this.#secret,
              clientId: this.clientId,
              localTimeOffset: this.#localTimeOffset,
              properties: {
                self: this.clientId,
                now: this.now,
              },
              outgoingUpdates: [update],
              skipValidation: true,
            };
            this.peerManagers[peerId].processor.sendUpdateBlob(context);
          }
        }
      }
    });
    this.#outgoingUpdates = this.#outgoingUpdates.filter(update => update !== undefined);

    const context: Context = {
      root: this.state,
      secret: this.#secret,
      clientId: this.clientId,
      localTimeOffset: this.#localTimeOffset,
      properties: {
        self: this.clientId,
        now: this.now,
      },
      outgoingUpdates: this.#outgoingUpdates,
      skipValidation: this.state.config?.signPayloads === false,
    };
    const updates = this.#processor.performCycle(context);
    if (context.clientId) {
      this.#selfData.clientId = context.clientId;
    }
    if (context.localTimeOffset) {
      this.#localTimeOffset = context.localTimeOffset;
    }
    this.#outgoingUpdates = context.outgoingUpdates;
    this.#secret = context.secret;

    this.triggerObservers(updates);
    checkPeerConnections(this);
    this.#socket?.stateChanged?.(this.state);
  }
}

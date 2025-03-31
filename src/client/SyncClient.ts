// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { ISharedData, SetDataOptions, UpdateOptions } from "./ISharedData";
import { ClientData } from "./ClientData";
import { SubData } from "./SubData";
import { PeerManager } from "./peer/PeerManager";
import { RoomState } from "@/types/RoomState";
import { Context, Processor, Update, setData, pushData, getData, Observer, IObservable } from "napl";
import { ISocket } from "./ISocket";
import { ISyncClient } from "./ISyncClient";
import { checkPeerConnections } from "./peer/check-peer";

export type SocketProvider = () => Promise<ISocket>;

export class SyncClient implements ISharedData, ISyncClient, IObservable {
  readonly state: RoomState;
  readonly #children: Map<string, ISharedData> = new Map();
  #socket: ISocket | undefined;
  #connectionPromise: Promise<void> | undefined;
  readonly #selfData: ClientData = new ClientData(this);
  readonly peerManagers: Record<string, PeerManager> = {};
  #localTimeOffset = 0;
  #nextFrameInProcess = false;
  #secret?: string;
  readonly #processor: Processor = new Processor((blob) => {
    if (blob.size > 1024 * 1024 * 10) {
      console.error(`Blob too large: ${blob.size / 1024 / 1024} MB`,);
      return;
    }
    this.#socket?.send(blob);
  });
  readonly #outgoingUpdates: (Update | undefined)[] = [];
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
    return this;
  }

  getData(path: string) {
    const context = {
      root: this.state,
      secret: this.#secret,
      clientId: this.clientId,
      localTimeOffset: this.#localTimeOffset,
      properties: {
        self: this.clientId,
        now: this.now,
      },
    };
    return getData(context, path);
  }

  pushData(path: string, value: any, options: UpdateOptions = {}) {
    pushData(this.state, this.now, this.#outgoingUpdates, path, value, options);
    this.#prepareNextFrame();
  }

  setData(path: string, value: any, options: SetDataOptions = {}) {
    setData(this.state, this.now, this.#outgoingUpdates, path, value, options);
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
    return this.#processor.observe(paths);
  }

  removeObserver(observer: Observer): void {
    this.#processor.removeObserver(observer);
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
    await this.#processor.receivedBlob(blob, context);

    this.#localTimeOffset = context.localTimeOffset;
    this.#secret = context.secret;
    this.#selfData.clientId = context.clientId;

    this.#prepareNextFrame();
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

    let j = 0;
    for (let i = 0; i < this.#outgoingUpdates.length; i++) {
      this.#outgoingUpdates[j] = this.#outgoingUpdates[i];
      if (this.#outgoingUpdates[j]) {
        j++;
      }
    }
    this.#outgoingUpdates.length = j;

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

    this.#processor.performCycle(context);
    if (context.clientId) {
      this.#selfData.clientId = context.clientId;
    }
    if (context.localTimeOffset) {
      this.#localTimeOffset = context.localTimeOffset;
    }
    this.#secret = context.secret;

    checkPeerConnections(this);
  }
}

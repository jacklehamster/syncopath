import { WebSocket } from "ws";
import { commitUpdates, markCommonUpdateConfirmed } from "@/data/data-update";
import { Update } from "@/types/Update";
import { addMessageReceiver } from "./SocketEventHandler";
import { Payload } from "./SocketPayload";
import { ClientState } from "@/types/ClientState";
import { RoomState } from "@/types/ServerState";
import { BlobBuilder } from "@dobuki/data-blob";
import { removeRestrictedData, removeRestrictedPeersFromUpdates } from "./peer-utils";
import { restrictedPath } from "./path-utils";

export class SyncRoom {
  readonly #sockets: Map<WebSocket, ClientState> = new Map();
  readonly #state: RoomState;
  readonly #onRoomChange = new Set<(roomState: RoomState) => void>();
  #updates: Update[] = [];
  static nextClientId = 1;

  constructor(private room: string) {
    this.#state = {
      clients: {},
      blobs: {},
      peer: {},
    };
  }

  addRoomChangeListener(callback: (roomState: RoomState) => void) {
    this.#onRoomChange.add(callback);
  }

  async welcomeClient(client: WebSocket) {
    //  initialize client state
    const clientId = `client-${SyncRoom.nextClientId++}`;
    const clientPath = `clients/${clientId}`;
    const clientState: ClientState = {};
    this.#sockets.set(client, clientState);

    const now = Date.now();

    //  annouce new client to all clients
    const newUpdates: Update[] = [{
      path: clientPath,
      value: clientState,
      confirmed: now,
      blobs: {},
    }];
    this.#shareUpdates(newUpdates, client);

    //  setup events
    addMessageReceiver(client, (payload, blobs) => {
      Object.entries(blobs).forEach(([key, blob]) => this.#state.blobs[key] = blob);
      payload.updates?.forEach(update => {
        const blobs = update.blobs ?? {};
        Object.keys(blobs).forEach(key => blobs[key] = this.#state.blobs[key]);
      });

      //  remove updates that are not allowed
      // const cancelledUpdates = payload.updates?.filter(update => this.#restrictedPath(update.path, clientId));
      payload.updates = payload.updates?.filter(update => !restrictedPath(update.path, clientId));

      this.#shareUpdates(payload.updates, client);
      setImmediate(() => this.#cleanupBlobs());
    });

    client.on("close", () => {
      this.#sockets.delete(client);
      this.#shareUpdates([{
        path: clientPath,
        value: undefined,
        confirmed: Date.now(),
        blobs: {},
      }]);

      console.log(`client ${clientId} disconnected from room ${this.room}`);
      this.#onRoomChange.forEach((callback) => callback(this.#state));
    });

    //  apply updates to clients
    commitUpdates(this.#state, this.#updates);
    this.#updates = this.#updates.filter(update => !update.confirmed)

    //  update client just connected with state and updates
    const welcomeBlobBuilder = BlobBuilder.payload<Payload>("payload", {
      myClientId: clientId,
      state: removeRestrictedData({ ...this.#state, blobs: {} }, clientId),
      updates: this.#updates,
      serverTime: now,
    });
    Object.entries(this.#state.blobs).forEach(([key, blob]) => welcomeBlobBuilder.blob(key, blob));
    this.#updates.forEach(update => Object.entries(update.blobs ?? {}).forEach(([key, blob]) => welcomeBlobBuilder.blob(key, blob)));

    client.send(await welcomeBlobBuilder.build().arrayBuffer());
    return { clientId };
  }

  #cleanupPeers() {
    for (let k in this.#state.peer) {
      const clients = k.split(":");
      if (clients.length !== 2 || !this.#state.clients[clients[0]] && !this.#state.clients[clients[1]]) {
        this.#shareUpdates([{
          path: `peer/${k}`,
          value: undefined,
          confirmed: Date.now(),
          blobs: {},
        }]);
      }
    }
  }

  #shareUpdates(newUpdates?: Update[], sender?: WebSocket) {
    if (!newUpdates?.length) {
      return;
    }
    const updatesForSender = newUpdates.filter(update => !update.confirmed);
    const now = Date.now();
    newUpdates.forEach(update => markCommonUpdateConfirmed(update, now));
    this.#pushUpdates(newUpdates);
    commitUpdates(this.#state, this.#updates);
    this.#updates = this.#updates.filter(update => !update.confirmed);
    this.#broadcastUpdates(newUpdates, client => client !== sender);
    this.#broadcastUpdates(updatesForSender, client => client === sender);
    this.#cleanupPeers();
  }

  #pushUpdates(newUpdates: Update[] | undefined) {
    newUpdates?.forEach((update) => this.#updates.push(update));
  }

  #broadcastUpdates(newUpdates: Update[] | undefined, senderFilter?: (sender: WebSocket) => boolean) {
    if (!newUpdates?.length) {
      return;
    }
    this.#sockets.entries().forEach(async ([client, state]) => {
      let clientId;
      for (let k in this.#state.clients) {
        if (this.#state.clients[k] === state) {
          clientId = k;
          break;
        }
      }

      const blobBuilder = BlobBuilder.payload("payload", { updates: removeRestrictedPeersFromUpdates(newUpdates, clientId) });
      newUpdates.forEach(update => Object.entries(update.blobs ?? {}).forEach(([key, blob]) => blobBuilder.blob(key, blob)));
      const buffer = await blobBuilder.build().arrayBuffer();

      if (senderFilter && !senderFilter(client)) {
        return;
      }
      client.send(buffer);
    });
  }

  #cleanupBlobs() {
    const blobSet = new Set(Object.keys(this.#state.blobs));
    this.#findUsedBlobs(this.#state, blobSet);
    if (blobSet.size) {
      // Remove blobs
      const updates: Update[] = [];
      const now = Date.now();
      blobSet.forEach(key => {
        updates.push({
          path: `blobs/${key}`,
          value: undefined,
          confirmed: now,
        });
      });
      this.#shareUpdates(updates);
    }
  }

  #findUsedBlobs(root: any, blobSet: Set<string>) {
    if (typeof root === "string") {
      if (blobSet.has(root)) {
        blobSet.delete(root);
      }
    } else if (Array.isArray(root)) {
      root.forEach(value => this.#findUsedBlobs(value, blobSet));
    } else if (root && typeof root === "object") {
      Object.values(root).forEach(value => this.#findUsedBlobs(value, blobSet));
    }
  }
}

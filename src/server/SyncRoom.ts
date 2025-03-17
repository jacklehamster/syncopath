import { WebSocket } from "ws";
import { clearUpdates, commitUpdates, markUpdateConfirmed } from "napl";
import { Update } from "@/types/Update";
import { addMessageReceiver } from "./SocketEventHandler";
import { Payload } from "./SocketPayload";
import { ClientState } from "@/types/ClientState";
import { RoomState } from "@/types/RoomState";
import { BlobBuilder } from "@dobuki/data-blob";
import { removeRestrictedData, removeRestrictedPeersFromUpdates } from "./peer-utils";
import { restrictedPath } from "./path-utils";
import { validatePayload } from "@dobuki/payload-validator";

export class SyncRoom {
  readonly #sockets: Map<WebSocket, string> = new Map();
  readonly state: RoomState;
  readonly #onRoomChange = new Set<(roomState: RoomState) => void>();
  static nextClientId = 1;

  constructor(private room: string) {
    this.state = {};
    this.state.updates = [];
  }

  addRoomChangeListener(callback: (roomState: RoomState) => void) {
    this.#onRoomChange.add(callback);
  }

  #setBlob(key: string, blob?: Blob) {
    if (blob) {
      if (!this.state.blobs) {
        this.state.blobs = {};
      }
      this.state.blobs[key] = blob;
    } else if (this.state.blobs) {
      delete this.state.blobs[key];
      if (!Object.keys(this.state.blobs).length) {
        delete this.state.blobs;
      }
    }
  }

  async welcomeClient(client: WebSocket) {
    const now = Date.now();
    const secret = crypto.randomUUID();

    //  initialize client state
    const clientId = `client-${SyncRoom.nextClientId++}`;
    const clientPath = `clients/${clientId}`;
    const clientState: ClientState = {
      joined: now,
    };
    this.#sockets.set(client, clientId);

    //  annouce new client to all clients
    const newUpdates: Update[] = [{
      path: clientPath,
      value: clientState,
      confirmed: now,
    }];
    this.#shareUpdates(newUpdates, client);

    //  setup events
    addMessageReceiver(client, (payload, blobs) => {
      Object.entries(blobs).forEach(([key, blob]) => this.#setBlob(key, blob));
      if (!payload.updates?.every(update => validatePayload(update, { secret }))) {
        console.warn("Invalid payload received from ", clientId);
        return;
      }
      payload.updates?.forEach(update => {
        const blobs = update.blobs ?? {};
        Object.keys(blobs).forEach(key => {
          if (this.state.blobs?.[key]) {
            blobs[key] = this.state.blobs[key];
          }
        });
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
      this.#onRoomChange.forEach((callback) => callback(this.state));
    });

    //  apply updates to clients
    const updates: Record<string, any> = {};
    commitUpdates(this.state, {
      now,
    }, updates);
    clearUpdates(this.state, updates);

    //  update client just connected with state and updates
    const welcomeBlobBuilder = BlobBuilder.payload<Payload>("payload", {
      myClientId: clientId,
      state: removeRestrictedData({ ...this.state }, clientId),
      serverTime: now,
      secret,
    });
    Object.entries(this.state.blobs ?? {}).forEach(([key, blob]) => welcomeBlobBuilder.blob(key, blob));

    client.send(await welcomeBlobBuilder.build().arrayBuffer());
    return { clientId };
  }

  #cleanupPeers() {
    for (let k in this.state.peer) {
      const clients = k.split(":");
      if (clients.length < 2 || !this.state.clients?.[clients[0]] && !this.state.clients?.[clients[1]]) {
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
    newUpdates.forEach(update => markUpdateConfirmed(update, now));
    this.#pushUpdates(newUpdates);
    const updates: Record<string, any> = {};
    commitUpdates(this.state, {
      now: Date.now(),
    }, updates);
    clearUpdates(this.state, updates);
    this.#broadcastUpdates(newUpdates, client => client !== sender);
    this.#broadcastUpdates(updatesForSender, client => client === sender);
    this.#cleanupPeers();
  }

  #pushUpdates(newUpdates: Update[] | undefined) {
    if (!this.state.updates) {
      this.state.updates = [];
    }
    newUpdates?.forEach((update) => this.state.updates?.push(update));
  }

  #broadcastUpdates(newUpdates: Update[] | undefined, senderFilter?: (sender: WebSocket) => boolean) {
    if (!newUpdates?.length) {
      return;
    }
    this.#sockets.entries().forEach(async ([client, clientId]) => {
      const blobBuilder = BlobBuilder.payload("payload", {
        updates: removeRestrictedPeersFromUpdates(newUpdates, clientId),
      });
      newUpdates.forEach(update => Object.entries(update.blobs ?? {})
        .forEach(([key, blob]) => blobBuilder.blob(key, blob)));
      const buffer = await blobBuilder.build().arrayBuffer();

      if (senderFilter && !senderFilter(client)) {
        return;
      }
      client.send(buffer);
    });
  }

  #cleanupBlobs() {
    const blobSet = new Set(Object.keys(this.state.blobs ?? {}));
    this.#findUsedBlobs(this.state, blobSet);
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

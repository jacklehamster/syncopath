import { WebSocket } from "ws";
import { commitUpdates, markUpdateConfirmed, packageUpdates, Payload, Update } from "napl";
import { addMessageReceiver } from "./SocketEventHandler";
import { ClientState } from "@/types/ClientState";
import { RoomState } from "@/types/RoomState";
import { BlobBuilder, checkPayload, extractBlobsFromPayload, includeBlobsInPayload } from "@dobuki/data-blob";
import { removeRestrictedData, removeRestrictedPeersFromUpdates } from "./peer-utils";
import { restrictedPath } from "./path-utils";

let nextClientId = 1;

export class SyncRoom {
  readonly #sockets: Map<WebSocket, string> = new Map();
  readonly state: RoomState = {};
  readonly #onRoomChange = new Set<(roomState: RoomState) => void>();
  readonly #secret = crypto.randomUUID();

  constructor(private room: string) {
  }

  addRoomChangeListener(callback: (roomState: RoomState) => void) {
    this.#onRoomChange.add(callback);
  }

  async welcomeClient(client: WebSocket) {
    const now = Date.now();

    //  initialize client state
    const clientId = `user-${nextClientId++}`;
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
    addMessageReceiver(client, (payload: Payload, blobs) => {
      if (this.#secret && this.state.config?.signPayloads !== false && !checkPayload(payload, this.#secret)) {
        console.error("Invalid payload received", payload);
        return;
      }

      payload.updates?.forEach(update => {
        const newValue = includeBlobsInPayload(update.value, blobs);
        if (newValue !== undefined) {
          update.value = newValue;
        }
      });

      //  remove updates that are not allowed
      // const cancelledUpdates = payload.updates?.filter(update => this.#restrictedPath(update.path, clientId));
      payload.updates = payload.updates?.filter(update => !restrictedPath(update.path, clientId));

      this.#shareUpdates(payload.updates, client);
    });

    client.on("close", () => {
      this.#sockets.delete(client);
      this.#shareUpdates([{
        path: clientPath,
        value: undefined,
        confirmed: Date.now(),
      }]);
      //  cleanup peers
      for (let key in this.state.peer) {
        const clientIds = key.split(":");
        if (clientIds.includes(clientId)) {
          this.#shareUpdates([{
            path: `peer/${key}`,
            value: undefined,
            confirmed: Date.now(),
          }]);
        }
      }

      console.log(`client ${clientId} disconnected from room ${this.room}`);
      this.#onRoomChange.forEach((callback) => callback(this.state));
    });

    //  apply updates to clients
    commitUpdates(this.state, {
      now,
    });

    const blobs: Record<string, Blob> = {};
    const payload = await extractBlobsFromPayload(removeRestrictedData({ ...this.state }, clientId), blobs);
    //  update client just connected with state and updates
    const updates: Update[] = [];
    for (let key in payload) {
      updates.push({
        path: key,
        value: this.state[key],
        confirmed: now,
      });
    }

    const welcomeBlobBuilder = BlobBuilder.payload<Payload>("payload", {
      myClientId: clientId,
      updates,
      globalTime: now,
      secret: this.#secret,
    }, this.#secret);
    Object.entries(blobs).forEach(([key, blob]) => welcomeBlobBuilder.blob(key, blob));

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
    this.state.updates = this.state.updates ?? [];
    this.state.updates.push(...newUpdates);
    commitUpdates(this.state, {
      now: Date.now(),
    });
    this.#broadcastUpdates(newUpdates, client => client !== sender);
    this.#broadcastUpdates(updatesForSender, client => client === sender);
    this.#cleanupPeers();
  }

  #broadcastUpdates(newUpdates: Update[] | undefined, senderFilter?: (sender: WebSocket) => boolean) {
    if (!newUpdates?.length) {
      return;
    }
    this.#sockets.entries().forEach(async ([client, clientId]) => {
      if (senderFilter && !senderFilter(client)) {
        return;
      }
      const clientUpdates = removeRestrictedPeersFromUpdates(newUpdates, clientId);
      const blobs: Record<string, Blob> = {};
      for (let update of clientUpdates) {
        update.value = await extractBlobsFromPayload(update.value, blobs);
      }
      const blob = packageUpdates(clientUpdates, blobs, this.#secret);
      const buffer = await blob.arrayBuffer();

      client.send(buffer);
    });
  }
}

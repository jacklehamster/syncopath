// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { PeerManager } from "./peer/PeerManager";
import { Context, Update, SyncClient } from "napl";
import { CommInterface } from "./CommInterface";
import { checkPeerConnections } from "./peer/check-peer";

export type CommProvider = () => Promise<CommInterface>;

export class PeerSyncClient extends SyncClient {
  readonly peerManagers: Record<string, PeerManager> = {};

  protected async processNextFrame() {
    let len = 0;
    this.outgoingUpdates.forEach((update, index) => {
      // skip updates to peers if there's a peerManager ready
      let del = false;
      if (update?.path.startsWith("peer/")) {
        const tag = update.path.split("/")[1];
        const clientIds = tag.split(":");
        if (clientIds.length === 2) {
          const peerId = clientIds[0] === this.clientId ? clientIds[1] : clientIds[0];
          if (this.peerManagers[peerId]?.ready) {
            del = true;
            //  Mark peer updates as confirmed
            update.confirmed = this.now;
            //  Send through peer manager
            const context: Context = {
              root: this.state,
              clientId: this.clientId,
              properties: {
                self: this.clientId,
                now: this.now,
              },
              outgoingUpdates: [update],
            };
            this.peerManagers[peerId].processor.sendUpdateBlob(context);
          }
        }
      }
      this.outgoingUpdates[len] = update;
      if (!del) {
        len++;
      }
    });
    this.outgoingUpdates.length = len;
    await super.processNextFrame();
    checkPeerConnections(this);
  }
}
export { SyncClient };

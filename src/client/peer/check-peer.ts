import { SetDataOptions } from "../ISharedData";
import { SyncClient } from "../SyncClient";
import { PeerManager } from "./PeerManager";

const WEB_RTC = "webRTC";
const DELAY_TO_DISCONNECT_WEBSOCKET_AFTER_PEER = 3000;
const PEER_OPTIONS: SetDataOptions = {
  active: true,
};

export function checkPeerConnections(syncClient: SyncClient) {
  for (const k in syncClient.state.peer) {
    const clients = k.split(":");
    const clientTag = `${clients[0]}:${clients[1]}`;
    if (clients[0] === syncClient.clientId) {
      // console.log("Checking peer connection", clients);
      if (clients.length >= 2 && !syncClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer) {
        //  initiate peer connections
        if (!syncClient.peerManagers[clients[1]]) {
          createPeerManager(syncClient, clientTag, clients[1]);
          syncClient.peerManagers[clients[1]].createOffer().then(offer => {
            syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/offer`, offer, PEER_OPTIONS);
          });
        }
      }
      if (syncClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.answer) {
        if (!syncClient.peerManagers[clients[1]].connected) {
          syncClient.peerManagers[clients[1]].acceptAnswer(syncClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.answer).then(() => {
            console.log("Peer connected");
          });
          syncClient.observe(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/ice/~{keys}`).onElementsAdded((candidates: string[]) => {
            candidates?.forEach(candidateName => {
              const candidate = syncClient.state.peer?.[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.ice?.[candidateName];
              syncClient.peerManagers[clients[1]].addIceCandidate(candidate);
              syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
            });
          });
          syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/answer`, undefined, PEER_OPTIONS);
        }
      }
    } else if (clients[1] === syncClient.clientId) {
      if (syncClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer) {
        //  accept offer
        if (!syncClient.peerManagers[clients[0]]) {
          createPeerManager(syncClient, clientTag, clients[0]);
          syncClient.peerManagers[clients[0]].acceptOffer(syncClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer).then(answer => {
            syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/answer`, answer, PEER_OPTIONS);
            syncClient.observe(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/ice/~{keys}`).onElementsAdded((candidates: string[]) => {
              candidates?.forEach(candidateName => {
                const candidate = syncClient.state.peer?.[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.ice?.[candidateName];
                syncClient.peerManagers[clients[0]].addIceCandidate(candidate);
                syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
              });
            });
          });
          syncClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/offer`, undefined, PEER_OPTIONS);
        }
      }
    }
  }
}

function createPeerManager(syncClient: SyncClient, tag: string, peerId: string) {
  console.log("Creating peer manager");
  syncClient.peerManagers[peerId] = new PeerManager({
    onData(data: any) {
      if (data instanceof Blob) {
        syncClient.onMessageBlob(data, true);
      }
    },
    onIce(ice: RTCIceCandidate) {
      const candidate = ice.candidate.split(" ")[0];
      syncClient.setData(`peer/${tag}:${WEB_RTC}/${syncClient.clientId}/ice/${candidate}`, ice, PEER_OPTIONS);
    },
    onClose() {
      delete syncClient.peerManagers[peerId];
      console.log("Peer closed");
    },
    onReady() {
      if (syncClient.state.config?.peerOnly) {
        setTimeout(() => syncClient.close(), DELAY_TO_DISCONNECT_WEBSOCKET_AFTER_PEER);
      }
    },
  });
}

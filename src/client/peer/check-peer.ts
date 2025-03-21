import { SetDataOptions } from "../ISharedData";
import { SyncClient } from "../SyncClient";
import { PeerManager } from "./PeerManager";

const WEB_RTC = "webRTC";
const DELAY_TO_DISCONNECT_WEBSOCKET_AFTER_PEER = 3000;
const PEER_OPTIONS: SetDataOptions = {
  active: true,
};

export function checkPeerConnections(socketClient: SyncClient) {
  for (const k in socketClient.state.peer) {
    const clients = k.split(":");
    const clientTag = `${clients[0]}:${clients[1]}`;
    if (clients[0] === socketClient.clientId) {
      // console.log("Checking peer connection", clients);
      if (clients.length >= 2 && !socketClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer) {
        //  initiate peer connections
        if (!socketClient.peerManagers[clients[1]]) {
          createPeerManager(socketClient, clientTag, clients[1]);
          socketClient.peerManagers[clients[1]].createOffer().then(offer => {
            socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/offer`, offer, PEER_OPTIONS);
          });
        }
      }
      if (socketClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.answer) {
        if (!socketClient.peerManagers[clients[1]].connected) {
          socketClient.peerManagers[clients[1]].acceptAnswer(socketClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.answer).then(() => {
            console.log("Peer connected");
          });
          socketClient.observe(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/ice/~{keys}`).onElementsAdded((candidates: string[]) => {
            candidates?.forEach(candidateName => {
              const candidate = socketClient.state.peer?.[`${clientTag}:${WEB_RTC}`]?.[clients[1]]?.ice?.[candidateName];
              socketClient.peerManagers[clients[1]].addIceCandidate(candidate);
              socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
            });
          });
          socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/answer`, undefined, PEER_OPTIONS);
        }
      }
    } else if (clients[1] === socketClient.clientId) {
      if (socketClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer) {
        //  accept offer
        if (!socketClient.peerManagers[clients[0]]) {
          createPeerManager(socketClient, clientTag, clients[0]);
          socketClient.peerManagers[clients[0]].acceptOffer(socketClient.state.peer[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.offer).then(answer => {
            socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[1]}/answer`, answer, PEER_OPTIONS);
            socketClient.observe(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/ice/~{keys}`).onElementsAdded((candidates: string[]) => {
              candidates?.forEach(candidateName => {
                const candidate = socketClient.state.peer?.[`${clientTag}:${WEB_RTC}`]?.[clients[0]]?.ice?.[candidateName];
                socketClient.peerManagers[clients[0]].addIceCandidate(candidate);
                socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
              });
            });
          });
          socketClient.setData(`peer/${clientTag}:${WEB_RTC}/${clients[0]}/offer`, undefined, PEER_OPTIONS);
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
        syncClient.onMessageBlob(data, undefined, true);
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

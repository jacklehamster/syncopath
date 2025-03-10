import { SetDataOptions } from "../ISharedData";
import { SocketClient } from "../SocketClient";
import { PeerManager } from "./PeerManager";

const DELAY_TO_DISCONNECT_WEBSOCKET_AFTER_PEER = 3000;
const PEER_OPTIONS: SetDataOptions = {
  active: true,
};

export function checkPeerConnections(socketClient: SocketClient) {
  for (const k in socketClient.state.peer) {
    const clients = k.split(":");
    if (clients[0] === socketClient.clientId) {
      // console.log("Checking peer connection", clients);
      if (clients.length >= 2 && !socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer) {
        //  initiate peer connections
        if (!socketClient.peerManagers[clients[1]]) {
          createPeerManager(socketClient, `${clients[0]}:${clients[1]}`, clients[1]);
          socketClient.peerManagers[clients[1]].createOffer().then(offer => {
            socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/offer`, offer, PEER_OPTIONS);
          });
        }
      }
      if (socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.answer) {
        if (!socketClient.peerManagers[clients[1]].connected) {
          socketClient.peerManagers[clients[1]].acceptAnswer(socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.answer).then(() => {
            console.log("Peer connected");
          });
          socketClient.observe(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/ice/~{keys}`).onElementsAdded((candidates) => {
            candidates?.forEach(candidateName => {
              const candidate = socketClient.state.peer?.[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.ice?.[candidateName];
              socketClient.peerManagers[clients[1]].addIceCandidate(candidate);
              socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
            });
          });
          socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/answer`, undefined, PEER_OPTIONS);
        }
      }
    } else if (clients[1] === socketClient.clientId) {
      if (socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer) {
        //  accept offer
        if (!socketClient.peerManagers[clients[0]]) {
          createPeerManager(socketClient, `${clients[0]}:${clients[1]}`, clients[0]);
          socketClient.peerManagers[clients[0]].acceptOffer(socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer).then(answer => {
            socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/answer`, answer, PEER_OPTIONS);
            socketClient.observe(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/ice/~{keys}`).onElementsAdded((candidates) => {
              candidates?.forEach(candidateName => {
                const candidate = socketClient.state.peer?.[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.ice?.[candidateName];
                socketClient.peerManagers[clients[0]].addIceCandidate(candidate);
                socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/ice/${candidateName}`, undefined, PEER_OPTIONS);
              });
            });
          });
          socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/offer`, undefined, PEER_OPTIONS);
        }
      }
    }
  }
}

function createPeerManager(socketClient: SocketClient, tag: string, peerId: string) {
  console.log("Creating peer manager");
  socketClient.peerManagers[peerId] = new PeerManager(socketClient.clientId,
    (data) => {
      if (data instanceof Blob) {
        socketClient.processDataBlob(data);
      }
    },
    (ice) => {
      const candidate = ice.candidate.split(" ")[0];
      socketClient.setData(`peer/${tag}:webRTC/${socketClient.clientId}/ice/${candidate}`, ice, PEER_OPTIONS);
    },
    () => {
      delete socketClient.peerManagers[peerId];
      console.log("Peer closed");
    },
    () => {
      if (socketClient.state.config?.peerOnly) {
        setTimeout(() => {
          socketClient.closeSocket();
        }, DELAY_TO_DISCONNECT_WEBSOCKET_AFTER_PEER);
      }
    },
  );
}

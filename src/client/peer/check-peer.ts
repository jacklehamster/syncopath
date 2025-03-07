import { SocketClient } from "../SocketClient";
import { PeerManager } from "./PeerManager";

export function checkPeerConnections(socketClient: SocketClient) {
  for (const k in socketClient.state.peer) {
    const clients = k.split(":");
    if (clients[0] === socketClient.clientId) {
      console.log("Checking peer connection", clients);
      if (clients.length >= 2 && !socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer) {
        //  initiate peer connections
        if (!socketClient.peerManagers[clients[1]]) {
          console.log("Creating peer manager");
          socketClient.peerManagers[clients[1]] = new PeerManager(socketClient.clientId,
            (data) => {
              console.log("Data received", data);
            },
            (ice) => {
              const candidate = ice.candidate.split(" ")[0];
              socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/ice/${candidate}`, ice, {
                active: true,
              });
            },
            () => {
              delete socketClient.peerManagers[clients[1]];
              console.log("Peer closed");
            },
          );
          socketClient.peerManagers[clients[1]].createOffer().then(offer => {
            console.log("Offer created", offer);
            socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/offer`, offer, {
              active: true,
            });
          });
        }
      }
      if (socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.answer) {
        if (!socketClient.peerManagers[clients[1]].connected) {
          socketClient.peerManagers[clients[1]].acceptAnswer(socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.answer).then(() => {
            console.log("Peer connected");
          });
          socketClient.observe(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/ice/{keys}`).onElementsAdded((candidates) => {
            candidates?.forEach(candidateName => {
              const candidate = socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[1]]?.ice?.[candidateName];
              socketClient.peerManagers[clients[1]].addIceCandidate(candidate);
              socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/ice/${candidateName}`, undefined);
            });
          });
          socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/answer`, undefined);
        }
      }
    } else if (clients[1] === socketClient.clientId) {
      if (socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer) {
        //  accept offer
        if (!socketClient.peerManagers[clients[0]]) {
          console.log("Creating peer manager");
          socketClient.peerManagers[clients[0]] = new PeerManager(socketClient.clientId,
            (data) => {
              console.log("Data received", data);
            },
            (ice) => {
              const candidate = ice.candidate.split(" ")[0];
              socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/ice/${candidate}`, ice, {
                active: true,
              });
            },
            () => {
              delete socketClient.peerManagers[clients[0]];
              console.log("Peer closed");
            },
          );
          socketClient.peerManagers[clients[0]].acceptOffer(socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.offer).then(answer => {
            console.log("Answer created", answer);
            socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[1]}/answer`, answer, {
              active: true,
            });
            socketClient.observe(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/ice/{keys}`).onElementsAdded((candidates) => {
              candidates?.forEach(candidateName => {
                const candidate = socketClient.state.peer[`${clients[0]}:${clients[1]}:webRTC`]?.[clients[0]]?.ice?.[candidateName];
                socketClient.peerManagers[clients[0]].addIceCandidate(candidate);
                socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/ice/${candidateName}`, undefined);
              });
            });
          });
          socketClient.setData(`peer/${clients[0]}:${clients[1]}:webRTC/${clients[0]}/offer`, undefined);
        }
      }
    }
  }
}

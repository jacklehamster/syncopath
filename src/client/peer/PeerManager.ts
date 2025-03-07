//  Share peer information using WebRTC

import { extractPayload } from "@dobuki/data-blob";

export class PeerManager {
  #peerConnection: RTCPeerConnection;
  #dataChannel?: RTCDataChannel;
  #onData: (data: any) => void;
  #onClose: () => void;
  connected = false;
  ready = false;

  constructor(private peerId: string, onData: (data: any) => void, onIce: (ice: any) => void, onClose: () => void) {
    this.#onData = onData;
    this.#onClose = onClose;
    this.#peerConnection = new RTCPeerConnection();
    this.#peerConnection.ondatachannel = (event) => {
      this.#dataChannel = event.channel;
      this.#setupDataChannel();
    };
    this.#peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        onIce(event.candidate);
      }
    };
  }

  addIceCandidate(ice: any) {
    this.#peerConnection.addIceCandidate(ice);
  }

  async createOffer() {
    this.#dataChannel = this.#peerConnection.createDataChannel("data");
    this.#setupDataChannel();

    return this.#peerConnection.createOffer().then((offer) => {
      this.#peerConnection.setLocalDescription(offer);
      return offer;
    });
  }

  async acceptOffer(offer: RTCSessionDescriptionInit) {
    this.#peerConnection.setRemoteDescription(offer);
    this.connected = true;
    return this.#peerConnection.createAnswer().then((answer) => {
      this.#peerConnection.setLocalDescription(answer);
      return answer;
    });
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit) {
    this.connected = true;
    await this.#peerConnection.setRemoteDescription(answer);
  }

  send(data: any) {
    if (data instanceof Blob) {
      this.#dataChannel?.send(data);
    } else {
      this.#dataChannel?.send(JSON.stringify(data));
    }
  }

  #setupDataChannel() {
    if (!this.#dataChannel) return;

    this.#dataChannel.onopen = () => {
      this.send({ msg: "hello" });
    };

    this.#dataChannel.onmessage = async (event) => {
      const obj = typeof (event.data) === "string"
        ? JSON.parse(event.data)
        : event.data instanceof ArrayBuffer
          ? new Blob([event.data])
          : event.data;
      if (obj.msg === "hello") {
        this.ready = true;
        return;
      }
      this.#onData(obj);
    };

    this.#dataChannel.onclose = this.#onClose;
  }
}

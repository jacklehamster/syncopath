//  Share peer information using WebRTC

import { Processor } from "napl";

interface Config {
  onData: (data: any) => void;
  onIce: (ice: any) => void;
  onClose: () => void;
  onReady: () => void;
}

export class PeerManager {
  #peerConnection: RTCPeerConnection;
  #dataChannel?: RTCDataChannel;
  #onData: (data: any) => void;
  #onClose: () => void;
  #onReady: () => void;
  connected = false;
  ready = false;
  processor = new Processor((blob) => this.#send(blob));

  constructor({ onData, onIce, onClose, onReady }: Config) {
    this.#onData = onData;
    this.#onClose = onClose;
    this.#onReady = onReady;
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

  addIceCandidate(ice: RTCIceCandidateInit) {
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

  #send(data: any) {
    if (data instanceof Blob) {
      this.#dataChannel?.send(data);
    } else {
      this.#dataChannel?.send(JSON.stringify(data));
    }
  }

  #setupDataChannel() {
    if (!this.#dataChannel) return;

    this.#dataChannel.onopen = () => {
      this.#send({ msg: "hello" });
    };

    this.#dataChannel.onmessage = async (event) => {
      const obj = typeof (event.data) === "string"
        ? JSON.parse(event.data)
        : event.data instanceof ArrayBuffer
          ? new Blob([event.data])
          : event.data;
      if (obj.msg === "hello") {
        this.ready = true;
        this.#onReady();
        return;
      }
      this.#onData(obj);
    };

    this.#dataChannel.onclose = this.#onClose;
  }

  close() {
    this.#dataChannel?.close();
    this.#peerConnection.close();
  }
}

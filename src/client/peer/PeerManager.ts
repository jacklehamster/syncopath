//  Share peer information using WebRTC

export class PeerManager {
  #peerConnection: RTCPeerConnection;
  #dataChannel?: RTCDataChannel;
  #onData: (data: any) => void;
  #onClose: () => void;
  connected = false;

  constructor(private peerId: string, onData: (data: any) => void, onIce: (ice: any) => void, onClose: () => void) {
    this.#onData = onData;
    this.#onClose = onClose;
    this.#peerConnection = new RTCPeerConnection();
    this.#peerConnection.ondatachannel = (event) => {
      console.log("Data channel created with", event.channel);
      this.#dataChannel = event.channel;
      this.#setupDataChannel();
    };
    this.#peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE candidate", event.candidate);
        onIce(event.candidate);
      }
    };
  }

  addIceCandidate(ice: any) {
    console.log("Adding ICE candidate", ice);
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
    console.log("accepting answer");
    this.connected = true;
    await this.#peerConnection.setRemoteDescription(answer);
  }

  connectToPeer(offer: RTCSessionDescriptionInit) {
    this.#peerConnection.setRemoteDescription(offer);
    this.#peerConnection.createAnswer().then((answer) => {
      this.#peerConnection.setLocalDescription(answer);
      this.#dataChannel = this.#peerConnection.createDataChannel("data");
      this.#dataChannel.onmessage = (event) => {
        this.#onData(JSON.parse(event.data));
      };
      this.#dataChannel.onclose = this.#onClose;
    });
  }

  send(data: any) {
    console.log("sending data", data);
    this.#dataChannel?.send(JSON.stringify(data));
  }

  #setupDataChannel() {
    if (!this.#dataChannel) return;

    this.#dataChannel.onopen = () => {
      console.log("Data channel is open with", this.#dataChannel);
      this.send({ author: this.peerId, type: "hello" });
    };

    this.#dataChannel.onmessage = (event) => {
      this.#onData(JSON.parse(event.data));
    };

    this.#dataChannel.onclose = this.#onClose;
  }
}

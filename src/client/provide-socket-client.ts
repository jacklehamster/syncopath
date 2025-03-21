import { RoomState } from "@/types/RoomState";
import { SocketProvider, SyncClient } from "./SyncClient";
import { ISyncClient } from "./ISyncClient";

interface Props {
  host: string;
  room?: string;
}

export function provideSocketClient({ host, room }: Props, state: RoomState = {}): ISyncClient {
  const prefix = host.startsWith("ws://") || host.startsWith("wss://") ? "" : globalThis.location.protocol === "https:" ? "wss://" : "ws://";
  const connectionUrl = `${prefix}${host}${room ? `?room=${room}` : ""}`;
  const socketProvider: SocketProvider = async () => {
    const websocket = new WebSocket(connectionUrl);
    websocket.addEventListener("open", () => {
      console.log("SyncClient connection opened");
    });
    return {
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        websocket.send(data);
      },
      onMessage(listener: (data: string | ArrayBuffer) => void) {
        websocket.addEventListener("message", (event) => {
          listener(event.data);
        });
      },
      onError(listener: (event: Event) => void) {
        websocket.addEventListener("error", listener);
      },
      onClose(listener: () => void) {
        websocket.addEventListener("close", listener);
      },
      close() {
        websocket.close();
      },
      supportBlob: true,
    };
  }
  return new SyncClient(socketProvider, state);
}

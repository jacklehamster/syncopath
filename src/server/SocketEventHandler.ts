import { WebSocket } from "ws";
import { extractPayload } from "@dobuki/data-blob";
import { Payload } from "napl";


export function addMessageReceiver(socket: WebSocket, payloadReceived: (payload: Payload, blobs: Record<string, Blob>) => void) {
  socket.on("message", async (message: any, binary: boolean) => {
    if (binary) {
      const blob = new Blob([message]);
      const { payload, ...blobs } = await extractPayload(blob);
      if (payload) {
        payloadReceived(payload, blobs);
      }
    } else {
      const payload = JSON.parse(message);
      payloadReceived(payload, {});
    }
  });
}

import type { Server } from "ws";
import { SyncSocket } from "./server/SyncSocket";
export * from "./server/SocketPayload";
export * from "./client/SyncClient";
export * from "./client/Observer";
export * from "./client/provide-socket-client";
export * from "./client/provide-playroom-client";

export function attachSyncSocket(server: Server<any>) {
  return new SyncSocket(server);
}

export function attachSyncSocketToWebSocket(webSocket: any, request?: Request) {
  const syncSocket = new SyncSocket();
  syncSocket.handleWebSocket(webSocket, new URLSearchParams(request?.url?.split("?")[1]));
  return syncSocket;
}

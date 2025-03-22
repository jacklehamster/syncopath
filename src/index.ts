import type { Server } from "ws";
import { SyncSocket } from "./server/SyncSocket";
export * from "./client/SyncClient";
export * from "./client/Observer";
export * from "./client/provide-socket-client";

export function attachSyncSocket(server: Server<any>) {
  return new SyncSocket(server);
}

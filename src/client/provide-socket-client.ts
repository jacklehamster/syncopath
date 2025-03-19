import { RoomState } from "@/types/RoomState";
import { SyncClient } from "./SyncClient";

export function provideSocketClient(host: string, room?: string, state: RoomState = {}) {
  const prefix = host.startsWith("ws://") || host.startsWith("wss://") ? "" : globalThis.location.protocol === "https:" ? "wss://" : "ws://";
  const connectionUrl = `${prefix}${host}${room ? `?room=${room}` : ""}`;
  const socketProvider = () => new WebSocket(connectionUrl);
  return new SyncClient(socketProvider, state);
}

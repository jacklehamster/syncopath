import { ClientState } from "@/types/ClientState";

export interface RoomState {
  clients: Record<number, ClientState>;
  blobs: Record<string, Blob>;
}

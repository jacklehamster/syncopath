import { ClientState } from "@/types/ClientState";

export interface RoomState {
  clients?: Record<string, ClientState>;
  blobs?: Record<string, Blob>;
  peer?: Record<string, any>;
  config?: {
    autoReconnect?: boolean;
    peerOnly?: boolean;
    activeUpdates?: boolean;
  };
  [key: string]: any;
}

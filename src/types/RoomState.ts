import { ClientState } from "@/types/ClientState";
import { Update } from "./Update";

export interface RoomState {
  clients?: Record<string, ClientState>;
  blobs?: Record<string, Blob>;
  peer?: Record<string, any>;
  config?: {
    autoReconnect?: boolean;
    peerOnly?: boolean;
    activeUpdates?: boolean;
  };
  updates?: Update[];
  [key: string]: any;
}

import { ClientState } from "@/types/ClientState";
import { Data } from "napl";

export interface RoomState extends Data {
  clients?: Record<string, ClientState>;
  peer?: Record<string, any>;
  config?: {
    autoReconnect?: boolean;
    peerOnly?: boolean;
    activeUpdates?: boolean;
  };
}

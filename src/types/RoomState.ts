import { ClientState } from "@/types/ClientState";
import { Data } from "napl";
import { Config } from "./Config";

export interface RoomState extends Data {
  clients?: Record<string, ClientState>;
  peer?: Record<string, any>;
  config?: Config;
}

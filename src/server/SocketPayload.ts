import { Update } from "napl";

export interface Payload {
  myClientId?: string;
  state?: Record<string, any>;
  updates?: Update[];
  serverTime?: number;
  secret?: string;
}

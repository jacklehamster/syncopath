import { Update } from "@/types/Update";

export interface Payload {
  myClientId?: string;
  state?: Record<string, any>;
  updates?: Update[];
  serverTime?: number;
}

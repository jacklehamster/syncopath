import { Action } from "./Action";

export interface Update {
  path: string;
  value?: any | undefined;
  append?: boolean;
  insert?: number;
  delete?: number;
  confirmed?: number;
  actions?: Action[];
  blobs?: { [key: string]: Blob };
}

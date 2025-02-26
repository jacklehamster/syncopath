export interface Update {
  path: string;
  value: any | undefined;
  push?: boolean;
  insert?: number;
  delete?: number;
  confirmed?: number;
  blobs?: { [key: string]: Blob };
}

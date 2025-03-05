import { Update } from "@/types/Update";

export interface SetDataOptions {
  active?: boolean;
  room?: string;
  push?: boolean;
  insert?: number;
  delete?: boolean;
}

export interface ISharedData {
  setData(path: Update["path"], value: any, options?: SetDataOptions): Promise<void>;
  state: Record<string, any>;
  triggerObservers(): void;
}

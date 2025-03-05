import { Update } from "@/types/Update";

export interface UpdateOptions {
  active?: boolean;
}

export interface SetDataOptions extends UpdateOptions {
  append?: boolean;
  insert?: number;
  delete?: boolean;
}

export interface ISharedData {
  setData(path: Update["path"], value: any, options?: SetDataOptions): Promise<void>;
  state: Record<string, any>;
  triggerObservers(): void;
}

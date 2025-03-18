export interface UpdateOptions {
  active?: boolean;
}

export interface SetDataOptions extends UpdateOptions {
  append?: boolean;
  insert?: number;
  delete?: boolean;
}

export interface ISharedData {
  setData(path: string, value: any, options?: SetDataOptions): Promise<void>;
  state: Record<string, any>;
  triggerObservers(updates: Record<string, any>): void;
}

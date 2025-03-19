export interface UpdateOptions {
  active?: boolean;
}

export interface SetDataOptions extends UpdateOptions {
  append?: boolean;
  insert?: number;
  delete?: boolean;
}

export interface ISharedData {
  clientId: string;
  state: Record<string, any>;
  setData(path: string, value: any, options?: SetDataOptions): Promise<void>;
  pushData(path: string, value: any, options?: UpdateOptions): Promise<void>
  triggerObservers(updates: Record<string, any>): void;
}

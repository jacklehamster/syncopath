export interface UpdateOptions {
  active?: boolean;
}

export interface SetDataOptions extends UpdateOptions {
  append?: boolean;
  insert?: number;
}

export interface ISharedData {
  clientId: string;
  state: Record<string, any>;
  getData(path: string): any;
  setData(path: string, value: any, options?: SetDataOptions): void;
  pushData(path: string, value: any, options?: UpdateOptions): void;
}

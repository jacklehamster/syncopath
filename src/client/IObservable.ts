import { Observer } from "./Observer";

export interface IObservable {
  observe(paths?: (string[] | string)): Observer;
}

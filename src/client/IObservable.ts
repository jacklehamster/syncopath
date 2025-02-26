import { Update } from "@/types/Update";
import { Observer } from "./Observer";

export interface IObservable {
  observe(...paths: Update["path"][]): Observer;
}

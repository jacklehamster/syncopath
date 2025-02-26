import { DataObject } from "../types/DataObject";
import { Update } from "../types/Update";

const SELF = "{self}";
const KEYS = "{keys}";
const VALUES = "{values}";
const SERVER_TIME = "~{serverTime}";

export function commitUpdates(root: DataObject, updates: Update[]) {
  const confirmedUpdates = getConfirmedUpdates(updates);
  confirmedUpdates?.forEach((update) => {
    const parts = update.path.split("/");
    const leaf: any = getLeafObject(root, parts, 1, true)!;
    const prop = parts[parts.length - 1];
    if (update.push) {
      if (!Array.isArray(leaf[prop])) {
        leaf[prop] = [];
      }
      leaf[prop] = [...leaf[prop], update.value];
    } else if ((update.insert ?? -1) >= 0) {
      if (!Array.isArray(leaf[prop])) {
        leaf[prop] = [];
      }
      leaf[prop] = [...leaf[prop].slice(0, (update.insert ?? -1)), update.value, ...leaf[prop].slice(update.insert)];
    } else if ((update.delete ?? -1) >= 0) {
      if (Array.isArray(leaf[prop])) {
        leaf[prop] = [...leaf[prop].slice(0, update.delete), ...leaf[prop].slice((update.delete ?? -1) + 1)];
      }
    } else if (update.value === undefined) {
      delete leaf[prop];
    } else {
      leaf[prop] = update.value;
    }
  });
}

function getConfirmedUpdates(updates: Update[]) {
  const confirmedUpdates = updates.filter(update => update.confirmed);
  confirmedUpdates?.sort((a, b) => {
    const confirmedA = a.confirmed ?? 0;
    const confirmedB = b.confirmed ?? 0;
    if (confirmedA !== confirmedB) {
      return confirmedA - confirmedB;
    }
    return a.path.localeCompare(b.path);
  });
  return confirmedUpdates;
}

export function getLeafObject(obj: DataObject, path: string | (string | number)[], offset: number, autoCreate: boolean, selfId?: string) {
  const parts = Array.isArray(path) ? path : path.split("/");
  let current = obj;
  for (let i = 0; i < parts.length - offset; i++) {
    let prop = selfId && parts[i] === SELF ? selfId : parts[i];
    if (prop === KEYS) {
      return Object.keys(current);
    }
    if (prop === VALUES) {
      return Object.values(current);
    }
    if (current[prop] === undefined) {
      if (autoCreate) {
        current[prop] = {};
      } else {
        return undefined;
      }
    }
    current = current[prop];
  }
  return current;
}

export function markCommonUpdateConfirmed(update: Update, now: number) {
  if (!update.confirmed) {
    update.confirmed = now;
    //  adjust update
    switch (update.value) {
      case SERVER_TIME:
        update.value = now;
        break;
    }
  }
}

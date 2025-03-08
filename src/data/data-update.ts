import { DataObject } from "../types/DataObject";
import { Update } from "../types/Update";

const SELF = "{self}";
const KEYS = "{keys}";
const VALUES = "{values}";
const NOW = "~{now}";

// This function is used to commit updates to the root object
export function commitUpdates(root: DataObject, updates: Update[]) {
  const confirmedUpdates = getConfirmedUpdates(updates);
  confirmedUpdates?.forEach((update) => {
    const parts = update.path.split("/");
    const leaf: any = getLeafObject(root, parts, 1, true)!;
    const prop = parts[parts.length - 1];
    if (update.actions) {
      const root = leaf[prop];
      for (let action of update.actions) {
        const { name, args } = action;
        if (typeof (root[name]) !== "function") {
          break;
        }
        root[name](...(args ?? []));
      }
      return;
    }

    if (update.append) {
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
      cleanupRoot(root, parts, 0);
    } else {
      leaf[prop] = update.value;
    }
  });
}

// This function is used to remove empty objects from the root object
function cleanupRoot(root: DataObject, parts: (string | number)[], index: number) {
  if (!root || typeof (root) !== "object" || Array.isArray(root)) {
    return false;
  }
  if (cleanupRoot(root[parts[index]], parts, index + 1)) {
    delete root[parts[index]];
  }
  return Object.keys(root).length === 0;
}

//  Get all confirmed updates and sort them by confirmed time
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

//  Dig into the object to get the leaf object, given the parts of the path
export function getLeafObject(obj: DataObject, parts: (string | number)[], offset: number, autoCreate: boolean, selfId?: string) {
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

//  Mark the update as confirmed
export function markUpdateConfirmed(update: Update, now: number) {
  if (!update.confirmed) {
    update.confirmed = now;
  }
  //  adjust update
  switch (update.value) {
    case NOW:
      update.value = now;
      break;
  }
}

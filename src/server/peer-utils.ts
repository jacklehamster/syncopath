import { RoomState } from "@/types/RoomState";
import { Update } from "napl";

export function removeRestrictedData(state: RoomState, clientId: string) {
  const newState: RoomState = {
    ...state,
    peer: { ...state.peer },
    updates: undefined,
  };
  for (const key in newState.peer) {
    const clients = key.split(":");
    if (clients.length < 2 || clients[0] !== clientId && clients[1] !== clientId) {
      delete newState.peer[key];
    }
  }
  if (!Object.keys(newState.peer ?? {}).length) {
    delete newState.peer;
  }
  return newState;
}

export function removeRestrictedPeersFromUpdates(updates: Update[], clientId?: string) {
  return updates.filter(update => {
    const parts = update.path.split("/");
    if (parts[0] === "peer") {
      const clients = parts[1].split(":");
      return clients.length >= 2 && (clients[0] === clientId || clients[1] === clientId);
    }
    return true;
  });
}

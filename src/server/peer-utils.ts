import { RoomState } from "@/types/ServerState";
import { Update } from "@/types/Update";

export function removeRestrictedData(state: RoomState, clientId: string) {
  const newState: RoomState = {
    ...state,
    peer: { ...state.peer },
  };
  for (const key in newState.peer) {
    const clients = key.split(":");
    if (clients.length < 2 || clients[0] !== clientId && clients[1] !== clientId) {
      delete newState.peer[key];
    }
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

import { RoomState } from "@/types/RoomState";

const CODEPEN_ROOM = /^codepen/i;

export function configureRoom(room: string, state: RoomState) {
  if (CODEPEN_ROOM.test(room)) {
    state.config = {
      ...state.config,
      autoReconnect: true,
      signPayloads: false,
    };
  }
}

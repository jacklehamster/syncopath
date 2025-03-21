import { RoomState } from "@/types/RoomState";
import { insertCoin, myPlayer, onPlayerJoin, RPC, PlayerState, getState, setState, waitForState } from "playroomkit";
import { SocketProvider, SyncClient } from "./SyncClient";

const GAME_ID = "Qm9wrwgSdncJRs0F8ST6";

interface Props {
  room?: string;
}

export function providePlayroomClient({ room }: Props, state: RoomState = {}): SyncClient {
  const socketProvider: SocketProvider = async () => {
    let messageListener: (data: any) => void = () => { };
    let closeListener: () => void = () => { };
    let onError: (event: Event) => void = () => { };

    //  enter the room
    await insertCoin({ roomCode: room, skipLobby: true, gameId: GAME_ID }, () => {
      console.log("Connected to room", room);
    }, (error: Error) => {
      onError(new ErrorEvent("error", { error }));
    });

    //  listen for updates
    RPC.register("update", async (data: any) => {
      messageListener(data);
    });

    const me = myPlayer();
    onPlayerJoin((player: PlayerState) => {
      if (player.id === me.id) {
        return;
      }
      player.onQuit(() => {
        syncClient.setData(`clients/${player.id}`, undefined);
        closeListener();
      });
    });

    requestAnimationFrame(async () => {
      await Promise.race([
        waitForState("state"),
        new Promise((resolve) => setTimeout(resolve, 1000))
      ]);
      messageListener({
        myClientId: me.id,
        state: getState("state"),
        updates: [
          {
            path: `clients/${me.id}`,
            value: {
              joined: Date.now(),
            },
            confirmed: true,
          }
        ]
      });
    });

    return {
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        RPC.call("update", data, RPC.Mode.OTHERS);
      },
      onMessage(listener: (data: any) => void): void {
        messageListener = listener;
      },
      onError(listener: (event: Event) => void): void {
        onError = listener;
      },
      onClose(listener: () => void): void {
        closeListener = listener;
      },
      close(): void {
        me.kick();
      },
      stateChanged(state: RoomState): void {
        setState("state", state);
      },
      serverless: true,
    };
  };
  const syncClient = new SyncClient(socketProvider, state);
  return syncClient;
}

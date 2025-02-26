import type { Server, WebSocket } from "ws";
import { SyncRoom } from "./SyncRoom";

export class SyncSocket {
  readonly #rooms: Record<string, SyncRoom> = {};

  constructor(server: Server<any>) {
    this.#hookupSocketServer(server);
  }

  #hookupSocketServer(websocketServer: Server) {
    websocketServer.on("listening", () => {
      const address = websocketServer.address();
      if (typeof address === "string") {
        console.log(`WebSocket server listening on ${address}`);
      } else if (address && typeof address === "object") {
        const host = address.address === '::' ? 'localhost' : address.address;
        console.log(`WebSocket server listening on ws://${host}:${address.port}`);
      }
    });

    websocketServer.on("connection", async (socket: WebSocket, req) => {
      //  extract query params
      const parameters = new URLSearchParams(req.url?.split("?")[1]);
      const roomName = parameters.get("room") ?? "default";
      const room = this.#getRoom(roomName);
      const { clientId } = await room.welcomeClient(socket);
      console.log(`client ${clientId} connected in room ${roomName}.`);
    });
  }

  #getRoom(roomName: string) {
    if (!this.#rooms[roomName]) {
      this.#rooms[roomName] = new SyncRoom(roomName);
      this.#rooms[roomName].addRoomChangeListener((roomState) => {
        //  close room after 10s if no clients
        setTimeout(() => {
          if (!Object.values(roomState.clients).length) {
            console.log("closing room", roomName);
            delete this.#rooms[roomName];
          }
        }, 10000);
      });
    }
    return this.#rooms[roomName];
  }
}

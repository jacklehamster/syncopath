# SyncoPath

SyncoPath is a library that facilitates the use of WebSocket and WebRTC.

- WebSocket enables multiplayer games by connecting them to a server in real-time.
- WebRTC is a real-time peer to peer technology that allows real-time communication without a server.

The SyncoPath library wraps that around a protocol where you simply share data between two entities. So rather than sending messages around, you have this big chunk of common data, and anything you change on one device will be updated on the other device. You can also observe the data and act accordingly when it gets modified.

For more details on usage, check out this blog post:
[Turn your phone into a wireless Joy-Con with SyncoPath](https://dev.to/jacklehamster/turn-your-phone-into-a-joystick-with-syncopath-1l78-temp-slug-904305)

## Server setup

To setup SyncoPath on your server, you can attach it to a WebSocket.

```typescript
import { createServer } from "https";
import express from "express";
import { WebSocketServer } from "ws";
import { attachSyncSocket } from "@dobuki/syncopath";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

attachSyncSocket(wss);
```

This associates SyncoPath with your socket server, then on the client, you can connect to it:

```typescript
import * as syncopath from "@dobuki/syncopath";

const socketClient = syncopath.provideSocketClient({
  host: "demo.dobuki.net",  //  <= This is my Socket server
  room: "my-room",
});

//  Shows a UI showing active users in the room, somewhere in the corner
syncopath.displayUsers(socketClient);

//  Sets the global
socketClient.setData("path/to/data", "some data");

//  Observe data
socketClient.observe("path/to/data").onChange(value => {
   document.querySelector("#label").textContent = value;
});

//  Observe the entire state, listen to any change
socketClient.observe().onChange(() => {
  console.log("Global state:", socketClient.state);
});
```

## Demo

Various usage for SyncoPath:
<https://synco.dobuki.net?show-tab=true>

SyncoSpace: A game that uses the phone as a remote joy-con:
<https://codepen.io/Vincent-Le-Quang-Dobuki/pen/PwoaJyW>

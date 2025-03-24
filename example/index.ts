import { createServer } from "https";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { attachSyncSocket } from "@dobuki/syncopath";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

const server = createServer(app);

const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  },
});

attachSyncSocket(wss);

app.get("/config.json", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.sendFile(path.join(__dirname, "config.json"));
    return;
  }
  res.json({
    "split": true,
    "show-tab": true,
    // "websocketHost": "wss://api.dobuki.net",
  });
});

app.use(express.static(path.join(__dirname, ".")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

server.addListener("listening", () => {
  const address = server.address();
  if (typeof address === "string") {
    console.log(`Listening on http://${address}:${PORT}`);
  } else if (address && typeof address === "object") {
    const host = address.address === '::' ? 'localhost' : address.address;
    console.log(`Listening on http://${host}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV ?? "dev"}`);
  }
});

server.listen(PORT);

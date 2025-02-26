import { createServer } from "https";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { attachSyncSocket } from "napl";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

const server = createServer(app);

const wss = new WebSocketServer({ server });

attachSyncSocket(wss);

app.get("/config.json", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.sendFile(path.join(__dirname, "config.json"));
    return;
  }
  res.json({
    "split": true,
    "show-tab": true,
    "websocketHost": "wss://api.dobuki.net",
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

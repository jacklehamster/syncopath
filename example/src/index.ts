// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

export { commitUpdates, SocketClient } from "@dobuki/syncopath";
import stringify from "json-stringify-pretty-compact";
import { SocketClient, Observer } from "@dobuki/syncopath";
import { SpriteSheet, loadSpriteSheet } from "aseprite-sheet";
import { hookupDiv } from "./react/component";

let name: string;
export function randomName() {
  return name ?? (name = "napl-" + Math.random().toString(36).substring(7));
}

const EMOJIS = [
  "🐵", "🐒", "🦍", "🦧", "🐶", "🐕", "🦮", "🐕‍🦺", "🐩", "🐺",
  "🦊", "🦝", "🐱", "🐈", "🐈‍⬛", "🦁", "🐯", "🐅", "🐆", "🐴",
  "🫎", "🫏", "🐎", "🦄", "🦓", "🦌", "🦬", "🐮", "🐂", "🐃",
  "🐄", "🐷", "🐖", "🐗", "🐽", "🐏", "🐑", "🐐", "🐪", "🐫",
  "🦙", "🦒", "🐘", "🦣", "🦏", "🦛", "🐭", "🐁", "🐀", "🐹",
  "🐰", "🐇", "🐿️", "🦫", "🦔", "🦇", "🐻", "🐻‍❄️", "🐨", "🐼",
  "🦥", "🦦", "🦨", "🦘", "🦡", "🐾", "🦃", "🐔", "🐓", "🐣",
  "🐤", "🐥", "🐦", "🐧", "🕊️", "🦅", "🦆", "🦢", "🦉", "🦤",
  "🪶", "🦩", "🦚", "🦜", "🪽", "🐦‍⬛", "🪿", "🐦‍🔥", "🪹", "🪺",
  "🐸", "🐊", "🐢", "🦎", "🐍", "🐲", "🐉", "🦕", "🦖", "🐳",
  "🐋", "🐬", "🦭", "🐟", "🐠", "🐡", "🦈", "🐙", "🐚", "🪸",
  "🪼", "🦀", "🦞", "🦐", "🦑", "🦪", "🐌", "🦋", "🐛", "🐜",
  "🐝", "🪲", "🐞", "🦗", "🪳", "🕷️", "🕸️", "🦂", "🦟", "🪰",
  "🪱", "🦠", "💐", "🌸", "💮", "🪷", "🏵️", "🌹", "🥀", "🌺",
  "🌻", "🌼", "🌷", "🪻", "🌱", "🪴", "🌲", "🌳", "🌴", "🌵",
  "🌾", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃", "🍄", "🪨", "🪵"
];

let emoji: string;
export function randomEmoji(forceRandom?: boolean) {
  return (forceRandom ? null : emoji) ?? (emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
}


const config = await fetch("../config.json").then((response) =>
  response.json()
);

function getSocketClient() {
  const urlVars = new URLSearchParams(location.search);
  const room = urlVars.get("room") ?? undefined;
  return new SocketClient(config.websocketHost ?? location.host, room);
}

export const socketClient = getSocketClient();
(window as any).socketClient = socketClient;

export { stringify };

export async function getSpriteSheet(path: string) {
  const spritesheetDefinition = await loadSpriteSheet(path);
  return new SpriteSheet(spritesheetDefinition!);
}

export function introduceName() {
  socketClient.observe("clients/{self}").onChange(() => {
    socketClient.self.setData("name", randomName());
    socketClient.self.setData("emoji", randomEmoji());
  });
}

export function displayUsers(userDiv: HTMLDivElement) {
  handleUsersChanged((clientId, isSelf, observers) => {
    observers.add(
      socketClient
        .observe(
          `clients/${clientId}/name`,
          `clients/${clientId}/emoji`
        )
        .onChange((name, emoji) => {
          client.textContent = `${emoji.value} ${name.value}`;
        })
    );

    // new client
    const client = document.createElement("div");
    client.id = `client-${clientId}`;
    client.textContent = clientId;
    if (isSelf) {
      client.style.fontWeight = "bold";
      client.style.backgroundColor = "yellow";
      userDiv.prepend(client);
    } else {
      userDiv.appendChild(client);
    }
  }, (clientId) => {
    const client = document.querySelector(`#client-${clientId}`) as HTMLDivElement;
    if (client) {
      client.style.transition = "opacity 0.3s";
      client.style.opacity = "0";
      setTimeout(() => {
        client.remove();
      }, 300);
    }
  });
}

export function trackCursor({ exclude = [] }: { exclude?: string[] } = {}) {
  document.addEventListener("mousemove", ({ pageX, pageY, target }) => {
    if (exclude.indexOf((target as any)?.id ?? "") >= 0) {
      socketClient.self.setData("cursor", undefined);
      return;
    }
    socketClient.self.setData("cursor", [pageX, pageY]);
  });
  document.addEventListener("mouseout", ({ target }) => {
    socketClient.self.setData("cursor", undefined);
  });
}

export function handleUsersChanged(onUserAdded: (clientId: string, isSelf: boolean, observers: Set<Observer>) => void, onUserRemoved?: (clientId: string) => void) {
  return socketClient
    .observe("clients/{keys}")
    .onElementsAdded((clientIds) => {
      clientIds?.forEach((clientId) => {
        const isSelf = clientId === socketClient.clientId;
        const observers = new Set<Observer>();
        onUserAdded(clientId, isSelf, observers);
        observers.add(
          socketClient.observe(`clients/${clientId}`).onChange((client) => {
            if (client.value === undefined) {
              observers.forEach((observer) => observer.close());
            }
          })
        );
      });
    })
    .onElementsDeleted((clientIds) => {
      clientIds?.forEach((clientId) => onUserRemoved?.(clientId));
    });
}

export function trackCursorObserver(clientId: string, callback: (cursor?: [number, number], ...extra: any[]) => void, extraObservations: string[] = []) {
  //  cursor observer
  return socketClient
    .observe(...[`clients/${clientId}/cursor`, ...extraObservations])
    .onChange((cursor, ...extra) => {
      if (!cursor.value) {
        callback();
        return;
      }
      callback(cursor.value, ...extra.map((e) => e.value));
    })
}

export function trackIsoCursorObserver(clientId: string, callback: (cursor?: [number, number], ...extra: any[]) => void, extraObservations: string[] = []) {
  //  cursor observer
  return socketClient
    .observe(...[`clients/${clientId}/isoCursor`, ...extraObservations])
    .onChange((cursor, ...extra) => {
      if (!cursor.value) {
        callback();
        return;
      }
      callback(cursor.value, ...extra.map((e) => e.value));
    })
}

export function hookDiv(div: HTMLElement) {
  hookupDiv(div, socketClient);
}

export * from "./iso-test/iso-utils"

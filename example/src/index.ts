// To recognize dom types (see https://bun.sh/docs/typescript#dom-types):
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import prettyStringify from "json-stringify-pretty-compact";
import { provideSocketClient } from "@dobuki/syncopath";
import * as syncopath from "@dobuki/syncopath";
import { SpriteSheet, loadSpriteSheet } from "aseprite-sheet";
import { hookupDiv } from "./react/component";
import { Observer } from "napl";



const config = await fetch("../config.json").then((response) =>
  response.json()
);

function getSocketClient() {
  const urlVars = new URLSearchParams(location.search);
  const room = urlVars.get("room") ?? undefined;
  return provideSocketClient({ host: config.websocketHost ?? location.host, room });
}

export const socketClient = getSocketClient();
(window as any).socketClient = socketClient;

export function stringify(obj: any) {
  return prettyStringify(obj, {
    maxLength: 60, replacer: (key, value) => {
      if (value instanceof Blob) {
        return `Blob(${value.size})`;
      }
      return value;
    }
  });
}

export async function getSpriteSheet(path: string) {
  const spritesheetDefinition = await loadSpriteSheet(path);
  return new SpriteSheet(spritesheetDefinition!);
}

export function introduceName() {
  syncopath.introduceName(socketClient);
}


export function displayUsers(userDiv?: HTMLDivElement) {
  syncopath.displayUsers(socketClient, userDiv);
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

export function handleUsersChanged(
  onUserAdded: (clientId: string, isSelf: boolean, observers: Set<Observer>) => void,
  onUserRemoved?: (clientId: string) => void
) {
  syncopath.handleUsersChanged(socketClient)
    .onUserAdded(onUserAdded)
    .onUserRemoved(onUserRemoved);
}

export function trackCursorObserver(clientId: string, callback: (cursor?: [number, number], ...extra: any[]) => void, extraObservations: string[] = []) {
  //  cursor observer
  return socketClient
    .observe([`clients/${clientId}/cursor`, ...extraObservations])
    .onChange((values) => {
      const [cursor, ...extra] = values ?? [];
      if (!cursor) {
        callback();
        return;
      }
      callback(cursor, ...extra);
    })
}

export function trackIsoCursorObserver(clientId: string, callback: (cursor?: [number, number], ...extra: any[]) => void, extraObservations: string[] = []) {
  //  cursor observer
  return socketClient
    .observe([`clients/${clientId}/isoCursor`, ...extraObservations])
    .onChange((values) => {
      const [cursor, ...extra] = values ?? [];
      if (!cursor) {
        callback();
        return;
      }
      callback(cursor, ...extra);
    })
}

export function hookDiv(div: HTMLElement) {
  hookupDiv(div, socketClient);
}

export * from "./iso-test/iso-utils"

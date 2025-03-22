import { ISyncClient } from "../ISyncClient";
import { Observer } from "../Observer";

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

export function handleUsersChanged(
  syncClient: ISyncClient,
) {
  let userAdded = (_clientId: string, _isSelf: boolean, _observers: Set<Observer>) => { };
  let userRemoved = (_clientId: string) => { };

  syncClient
    .observe("clients/~{keys}")
    .onElementsAdded((clientIds: string[]) => {
      clientIds?.forEach((clientId) => {
        const isSelf = clientId === syncClient.clientId;
        const observers = new Set<Observer>();
        userAdded(clientId, isSelf, observers);
        observers.add(
          syncClient.observe(`clients/${clientId}`).onChange((client) => {
            if (client === undefined) {
              observers.forEach((observer) => observer.close());
            }
          })
        );
      });
    })
    .onElementsDeleted((clientIds: string[]) => {
      clientIds.forEach((clientId) => userRemoved(clientId));
    });

  const returnValue = {
    onUserAdded: (callback: (clientId: string, isSelf: boolean, observers: Set<Observer>) => void) => {
      userAdded = callback;
      return returnValue;
    },
    onUserRemoved: (callback: (clientId: string) => void) => {
      userRemoved = callback;
      return returnValue;
    },
  };
  return returnValue;
}

export function displayUsers(syncClient: ISyncClient, userDiv?: HTMLDivElement) {
  userDiv = userDiv ?? document.body.appendChild(document.createElement("div"));
  userDiv.classList.add("syncousers");
  handleUsersChanged(syncClient)
    .onUserAdded?.((clientId, isSelf, observers) => {
      // new client
      getOrCreateClientBox(syncClient, userDiv, observers, clientId, isSelf);
    })
    .onUserRemoved?.((clientId) => {
      const client = document.querySelector(`#div-${clientId}`) as HTMLDivElement;
      if (client) {
        client.style.transition = "opacity 0.3s";
        client.style.opacity = "0";
        setTimeout(() => {
          client.remove();
        }, 300);
      }
    });
  introduceName(syncClient);
}

export function introduceName(syncClient: ISyncClient) {
  syncClient.self.setData("name", randomName());
  syncClient.self.setData("emoji", randomEmoji());
}

let name: string;
export function randomName() {
  return name ?? (name = "guest-" + Math.random().toString(36).substring(8));
}

let emoji: string;
export function randomEmoji(forceRandom?: boolean) {
  return (forceRandom ? null : emoji) ?? (emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
}

function getOrCreateClientBox(syncClient: ISyncClient, container: HTMLDivElement, observers: Set<Observer>, clientId: string, isSelf: boolean) {
  const box = document.querySelector(`#client-${clientId}`);
  if (box) {
    return box;
  }
  const clientBox = document.createElement("div");
  clientBox.id = `client-${clientId}`;
  clientBox.classList.add("client-box");
  clientBox.style.backgroundColor = isSelf ? "yellow" : "";
  clientBox.style.fontWeight = isSelf ? "bold" : "normal";
  clientBox.style.display = "flex";
  clientBox.style.flexDirection = "row";

  //  Emoji
  const emojiDiv = clientBox.appendChild(document.createElement("span"));
  emojiDiv.style.marginRight = "5px";
  if (isSelf) {
    emojiDiv.style.cursor = "pointer";
    emojiDiv.addEventListener("click", () => {
      syncClient.setData(`clients/~{self}/emoji`, randomEmoji(true));
    });
  }

  //  Name label
  const nameDiv = clientBox.appendChild(document.createElement("div"));
  nameDiv.id = `name-${clientId}`;
  nameDiv.style.width = "calc(100% - 10px)";

  observers.add(
    syncClient
      .observe([
        `clients/${clientId}/emoji`,
        `clients/${clientId}/name`,
      ])
      .onChange(([emoji, name]) => {
        emojiDiv.textContent = emoji;
        nameDiv.textContent = name;
      })
  );

  if (isSelf) {
    container.prepend(clientBox);
  } else {
    container.appendChild(clientBox);
  }
  return clientBox;
}

import { getSpriteSheet, socketClient, handleUsersChanged, trackCursorObserver, trackIsoCursorObserver } from "..";

const scaleX = 70;
const scaleY = 40;

function gridPositionToView(x: number, y: number) {
  return [(x + y) * scaleX / 2, (-x + y) * scaleY / 2];
}

function viewPositionToGrid(x: number, y: number) {
  return [Math.round(x / scaleX - y / scaleY), Math.round(x / scaleX + y / scaleY)];
}

export async function displayIsoUI(path: string) {
  function getDraggedItem(clientId: string) {
    let div = document.getElementById(`drag-${clientId}`) as HTMLDivElement;
    if (!div) {
      div = document.body.appendChild(document.createElement("div"));
      div.id = `drag-${clientId}`;
      div.style.position = "absolute";
      div.style.pointerEvents = "none";
      div.style.top = "0";
      div.style.left = "0";
      div.style.opacity = "0.5";
      div.style.transform = "scale(0.15)";
      div.style.transformOrigin = "top left";
    }
    return div;
  }


  let selectedTime = 0;
  const spriteSheet = await getSpriteSheet(path);
  const ui = document.body.appendChild(document.createElement("div"));
  ui.style.display = "flex";
  ui.style.flexWrap = "wrap";
  ui.style.zoom = "0.05";
  for (let i = 0; i < spriteSheet.count; i++) {
    const sprite = spriteSheet.getSprite(i);
    const div = sprite.generateDiv();
    div.id = `sprite-${i}`;
    div.style.border = "20px solid #00000000";
    div.addEventListener("mousedown", () => {
      socketClient.self.setData("selected", i);
      selectedTime = Date.now();
    });
    ui.appendChild(div);
  }
  for (let tag of spriteSheet.getTags()) {
    const sprite = spriteSheet.getTaggedSprite(tag.name)!;
    const div = sprite.generateDiv();
    div.style.border = "20px solid #00000000";
    div.id = `sprite-${tag.name}`;
    div.addEventListener("mousedown", () => {
      socketClient.self.setData("selected", tag.name);
      selectedTime = Date.now();
    });
    ui.appendChild(div);
  }

  //  On mouse down, if an item is selected, drop it
  document.addEventListener("mouseup", (event) => {
    const selected = socketClient.self.state.selected;
    if (selected !== undefined && socketClient.self.state.isoCursor && Date.now() - selectedTime > 300) {
      insertInIsoWorld(selected, socketClient.self.state.isoCursor[0], socketClient.self.state.isoCursor[1]);
      socketClient.self.setData("selected", undefined);
    }
  });

  handleUsersChanged((clientId, _isSelf, observers) => {
    observers
      .add(
        socketClient
          .observe(`clients/${clientId}/selected`)
          .onChange((selected) => {
            const previousSelected = document.getElementById(`sprite-${selected.previous}`);
            if (previousSelected) {
              previousSelected.style.border = "20px solid #00000000";
            }
            const selectedDiv = document.getElementById(`sprite-${selected.value}`);
            if (selectedDiv) {
              const selectedBySelf = socketClient.self.state.selected === selected.value;
              const color = selectedBySelf ? "red" : "gray";
              const dashed = !selectedBySelf ? "dashed" : "solid";
              selectedDiv.style.border = `20px ${dashed} ${color}`;
              const sprite = isNaN(selected.value) ? spriteSheet.getTaggedSprite(selected.value)! : spriteSheet.getSprite(parseInt(selected.value));
              getDraggedItem(clientId).replaceChildren(sprite.generateDiv());
            }
          })
      )
      .add(trackCursorObserver(clientId, (cursor, selected) => {
        const draggedItem = getDraggedItem(clientId);
        if (!cursor || selected === undefined) {
          socketClient.self.setData("isoCursor", undefined);
          return;
        }
        const [x, y] = cursor;
        socketClient.self.setData("isoCursor", viewPositionToGrid(x, y));
        draggedItem.style.display = "";
      }, [`clients/${clientId}/selected`]))
      .add(trackIsoCursorObserver(clientId, (cursor) => {
        const draggedItem = getDraggedItem(clientId);
        if (!cursor) {
          draggedItem.style.display = "none";
          return;
        }
        draggedItem.style.display = "";
        const [x, y] = gridPositionToView(cursor[0], cursor[1]);
        draggedItem.style.left = `${x - 40}px`;
        draggedItem.style.top = `${y - 40}px`;
      }));
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


  function trackIsoWorldObserver() {
    socketClient.observe("iso/world/{keys}").onElementsAdded((keys) => {
      keys?.forEach((uid) => {
        const { type, x, y } = socketClient.state.iso.world[uid];
        const sprite = spriteSheet.getTaggedSprite(type) ?? spriteSheet.getSprite(type);
        const div = sprite.generateDiv();
        const [viewX, viewY] = gridPositionToView(x, y);
        div.id = `elem-${uid}`;
        div.style.position = "absolute";
        div.style.left = `${viewX - 40}px`;
        div.style.top = `${viewY - 40}px`;
        div.style.transform = "scale(0.15)";
        div.style.transformOrigin = "top left";
        div.addEventListener("mousedown", () => {
          socketClient.self.setData("selected", type);
          selectedTime = Date.now();
          socketClient.self.setData("cursor", [x, y]);
          socketClient.setData(`iso/world/${uid}`, undefined);
        });
        document.body.appendChild(div);
      });
    }).onElementsDeleted((keys) => {
      keys?.forEach((uid) => {
        const div = document.getElementById(`elem-${uid}`);
        if (div) {
          div.remove();
        }
      });
    });
  }
  trackIsoWorldObserver();
}

export function insertInIsoWorld(type: string, x: number, y: number) {
  const uid = Math.random().toString(36).substring(3);
  socketClient.setData(`iso/world/${uid}`, { type, x, y });
}

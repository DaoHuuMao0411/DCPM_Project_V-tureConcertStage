import './style.css';
import { App } from './core/App.js';
import { RoomClient } from './network/RoomClient.js';
import { LobbyView } from './ui/LobbyView.js';

const root = document.querySelector('#app');
const roomClient = new RoomClient();
let app = null;

const lobby = new LobbyView(root, {
  roomClient,
  onEnterRoom: (roomState) => enterConcert('room', roomState)
});

lobby.mount();

function enterConcert(mode, roomState = null) {
  lobby.setVisible(false);
  app?.destroy();
  app = new App(root, {
    mode,
    roomClient: mode === 'room' ? roomClient : null,
    initialRoomState: roomState,
    onExitToLobby: (message) => returnToLobby(message)
  });
  app.start();
}

function returnToLobby(message = null) {
  app?.destroy();
  app = null;
  lobby.setVisible(true, message);
  roomClient.listRooms().catch(() => {});
}

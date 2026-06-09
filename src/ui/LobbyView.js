import { ROOM_SERVER_OFFLINE_MESSAGE } from '../network/RoomClient.js';

export function createInitialLobbyState() {
  return {
    mode: 'lobby',
    isBusy: false,
    error: null,
    rooms: []
  };
}

export function reduceLobbyState(state = createInitialLobbyState(), event = {}) {
  switch (event.type) {
    case 'rooms:updated':
      return {
        ...state,
        rooms: normalizeLobbyRooms(event.rooms),
        error: null
      };
    case 'action:start':
      return {
        ...state,
        isBusy: true,
        error: null
      };
    case 'action:error':
      return {
        ...state,
        isBusy: false,
        error: event.message || 'Room action failed.'
      };
    case 'enter:host':
      return {
        ...state,
        mode: 'room',
        isBusy: false,
        error: null,
        role: 'host',
        roomId: event.roomId ?? null
      };
    case 'enter:audience':
      return {
        ...state,
        mode: 'room',
        isBusy: false,
        error: null,
        role: 'audience',
        roomId: event.roomId ?? null
      };
    case 'enter:solo':
      return {
        ...state,
        mode: 'solo',
        isBusy: false,
        error: null,
        role: 'solo',
        roomId: null
      };
    case 'return:lobby':
      return {
        ...state,
        mode: 'lobby',
        isBusy: false,
        error: event.message ?? null,
        role: null,
        roomId: null
      };
    default:
      return state;
  }
}

export function getLobbyMarkup() {
  return `
      <section class="lobby-hero" aria-label="Local concert lobby">
        <div class="lobby-copy">
          <h1>Virtual Concert Platform</h1>
          <p class="lobby-subtitle">Create or join a local concert room, then enter the 3D venue together.</p>
        </div>
        <div class="lobby-actions" aria-label="Room actions">
          <div class="lobby-action-row">
            <input data-lobby-name type="text" maxlength="40" autocomplete="off" placeholder="Room Name" aria-label="Room Name" />
            <button class="primary-button" data-lobby-create type="button">Create Room</button>
          </div>
          <div class="lobby-action-row">
            <input data-lobby-code type="text" maxlength="6" inputmode="text" autocomplete="off" placeholder="Room Code" aria-label="Room Code" />
            <button class="secondary-button" data-lobby-join type="button">Join Room</button>
          </div>
          <div class="lobby-error" data-lobby-error role="status"></div>
        </div>
      </section>
      <section class="lobby-room-list" aria-label="Available rooms">
        <div class="lobby-section-title">
          <h2>Available Rooms</h2>
          <button class="secondary-button" data-lobby-refresh type="button">Refresh</button>
        </div>
        <div class="rooms-list" data-rooms-list></div>
      </section>
    `;
}

export class LobbyView {
  constructor(root, options = {}) {
    this.root = root;
    this.roomClient = options.roomClient;
    this.onEnterRoom = options.onEnterRoom ?? (() => {});
    this.state = createInitialLobbyState();
    this.element = document.createElement('main');
    this.element.className = 'lobby-screen';
    this.element.innerHTML = getLobbyMarkup();
    this.root.appendChild(this.element);

    this.createButton = this.element.querySelector('[data-lobby-create]');
    this.joinButton = this.element.querySelector('[data-lobby-join]');
    this.refreshButton = this.element.querySelector('[data-lobby-refresh]');
    this.roomNameInput = this.element.querySelector('[data-lobby-name]');
    this.roomCodeInput = this.element.querySelector('[data-lobby-code]');
    this.errorEl = this.element.querySelector('[data-lobby-error]');
    this.roomsListEl = this.element.querySelector('[data-rooms-list]');

    this.bindEvents();
    this.render();
  }

  mount() {
    this.setVisible(true);
    this.refreshRooms();
  }

  setVisible(isVisible, message = null) {
    this.element.classList.toggle('is-hidden', !isVisible);
    if (isVisible && message) {
      this.applyLobbyEvent({ type: 'return:lobby', message });
    } else if (isVisible) {
      this.applyLobbyEvent({ type: 'return:lobby' });
    }
  }

  bindEvents() {
    this.createButton.addEventListener('click', () => this.createRoom());
    this.joinButton.addEventListener('click', () => this.joinRoom(this.roomCodeInput.value));
    this.refreshButton.addEventListener('click', () => this.refreshRooms());
    this.roomCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.joinRoom(this.roomCodeInput.value);
      }
    });
    this.roomNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.createRoom();
      }
    });

    this.roomClient.on('rooms:updated', (roomState) => {
      this.applyLobbyEvent({ type: 'rooms:updated', rooms: roomState.rooms });
    });
    this.roomClient.on('error', (roomState) => {
      if (!roomState.roomId) {
        this.applyLobbyEvent({
          type: 'action:error',
          message: roomState.error?.message ?? 'Room server error.'
        });
      }
    });
    this.roomClient.on('disconnected', () => {
      this.applyLobbyEvent({
        type: 'action:error',
        message: ROOM_SERVER_OFFLINE_MESSAGE
      });
    });
  }

  async refreshRooms() {
    this.applyLobbyEvent({ type: 'action:start' });
    try {
      const rooms = await this.roomClient.listRooms();
      this.applyLobbyEvent({ type: 'rooms:updated', rooms });
      this.applyLobbyEvent({ type: 'return:lobby' });
    } catch (error) {
      this.applyLobbyEvent({
        type: 'action:error',
        message: error.message || 'Could not load rooms.'
      });
    }
  }

  async createRoom() {
    this.applyLobbyEvent({ type: 'action:start' });
    try {
      const roomState = await this.roomClient.createRoom({
        roomName: this.roomNameInput.value
      });
      this.applyLobbyEvent({ type: 'enter:host', roomId: roomState.roomId });
      this.onEnterRoom(roomState);
    } catch (error) {
      this.applyLobbyEvent({
        type: 'action:error',
        message: error.message || 'Could not create room.'
      });
    }
  }

  async joinRoom(roomId) {
    const normalizedRoomId = String(roomId ?? '').trim().toUpperCase();
    if (!normalizedRoomId) {
      this.applyLobbyEvent({ type: 'action:error', message: 'Enter a room code.' });
      return;
    }

    this.applyLobbyEvent({ type: 'action:start' });
    try {
      const roomState = await this.roomClient.joinRoom(normalizedRoomId);
      this.applyLobbyEvent({ type: 'enter:audience', roomId: roomState.roomId });
      this.onEnterRoom(roomState);
    } catch (error) {
      this.applyLobbyEvent({
        type: 'action:error',
        message: error.message || 'Could not join room.'
      });
    }
  }

  applyLobbyEvent(event) {
    this.state = reduceLobbyState(this.state, event);
    this.render();
  }

  render() {
    this.createButton.disabled = this.state.isBusy;
    this.joinButton.disabled = this.state.isBusy;
    this.refreshButton.disabled = this.state.isBusy;
    this.roomNameInput.disabled = this.state.isBusy;
    this.roomCodeInput.disabled = this.state.isBusy;
    this.errorEl.textContent = this.state.error ?? '';
    this.renderRooms();
  }

  renderRooms() {
    this.roomsListEl.replaceChildren();
    if (!this.state.rooms.length) {
      const empty = document.createElement('p');
      empty.className = 'rooms-empty';
      empty.textContent = 'No rooms available yet.';
      this.roomsListEl.appendChild(empty);
      return;
    }

    this.state.rooms.forEach((room) => {
      const item = document.createElement('article');
      item.className = 'room-list-item';

      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = room.name;
      const code = document.createElement('span');
      code.textContent = `Code: ${room.roomId}`;
      const meta = document.createElement('span');
      meta.textContent = `${room.status} - ${room.userCount} user${room.userCount === 1 ? '' : 's'} - ${room.playlistCount} track${room.playlistCount === 1 ? '' : 's'}`;
      details.append(name, code, meta);

      const joinButton = document.createElement('button');
      joinButton.className = 'secondary-button';
      joinButton.type = 'button';
      joinButton.textContent = 'Join';
      joinButton.addEventListener('click', () => this.joinRoom(room.roomId));

      item.append(details, joinButton);
      this.roomsListEl.appendChild(item);
    });
  }
}

export function normalizeLobbyRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : []).map((room) => ({
    roomId: String(room.roomId ?? ''),
    code: String(room.code ?? room.roomId ?? ''),
    name: String(room.name ?? 'Untitled Room'),
    isPermanent: Boolean(room.isPermanent),
    userCount: Math.max(0, Number(room.userCount) || 0),
    status: normalizeLobbyRoomStatus(room.status),
    isPlaying: Boolean(room.isPlaying || room.status === 'playing'),
    hostPresent: room.hostPresent !== false,
    createdAt: Number.isFinite(Number(room.createdAt)) ? Number(room.createdAt) : null,
    playlistCount: Math.max(0, Number(room.playlistCount) || 0),
    hasPlaylist: Boolean(room.hasPlaylist || Number(room.playlistCount) > 0)
  })).filter((room) => room.roomId);
}

function normalizeLobbyRoomStatus(status) {
  return ['playing', 'paused', 'stopped'].includes(status) ? status : 'stopped';
}

import { io } from 'socket.io-client';
import {
  createInitialRoomClientState,
  reduceRoomClientState
} from './roomClientState.js';
import {
  cloneRoomClientState,
  normalizeConnectionError
} from './roomStateNormalizer.js';

export {
  ROOM_SERVER_OFFLINE_MESSAGE,
  createInitialRoomClientState,
  reduceRoomClientState
} from './roomClientState.js';

export const DEFAULT_ROOM_SERVER_URL = getDefaultRoomServerUrl();
export const ROOM_CLIENT_TIMEOUT_MS = 2500;

export class RoomClient {
  constructor(options = {}) {
    this.url = options.url ?? DEFAULT_ROOM_SERVER_URL;
    this.socketFactory = options.socketFactory ?? io;
    this.timeoutMs = options.timeoutMs ?? ROOM_CLIENT_TIMEOUT_MS;
    this.socket = null;
    this.state = createInitialRoomClientState();
    this.listeners = new Map();
  }

  connect(options = {}) {
    const autoStart = options.autoStart !== false;
    if (this.socket) {
      if (autoStart && !this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.socket = this.socketFactory(this.url, {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: false
    });
    this.bindSocketEvents();
    if (autoStart) {
      this.socket.connect();
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  getState() {
    return cloneRoomClientState(this.state);
  }

  async createRoom(payload = {}) {
    const response = await this.emitWithAck('room:create', payload);
    this.applyEvent({ type: 'room:state', state: response.state });
    this.emit('room:created', this.getState());
    return this.getState();
  }

  async joinRoom(roomId, payload = {}) {
    const response = await this.emitWithAck('room:join', {
      ...payload,
      roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    this.emit('room:joined', this.getState());
    return this.getState();
  }

  async leaveRoom() {
    const response = await this.emitWithAck('room:leave', {
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async requestState() {
    const response = await this.emitWithAck('room:state', {
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async listRooms() {
    const response = await this.emitWithAck('rooms:list', {});
    this.applyEvent({ type: 'rooms:updated', rooms: response.rooms });
    this.emit('rooms:updated', this.getState());
    return this.getState().rooms;
  }

  async startConcert(payload = {}) {
    const response = await this.emitWithAck('concert:start', {
      ...payload,
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async pauseConcert(payload = {}) {
    const response = await this.emitWithAck('concert:pause', {
      ...payload,
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async resumeConcert(payload = {}) {
    const response = await this.emitWithAck('concert:resume', {
      ...payload,
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async stopConcert() {
    const response = await this.emitWithAck('concert:stop', {
      roomId: this.state.roomId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async selectRoomTrack(trackId) {
    const response = await this.emitWithAck('concert:select-track', {
      roomId: this.state.roomId,
      trackId
    });
    this.applyEvent({ type: 'room:state', state: response.state });
    return this.getState();
  }

  async uploadRoomPlaylist(files) {
    const socket = await this.ensureConnected();
    const roomId = this.state.roomId;
    if (!roomId) {
      throw new Error('Join or create a room before uploading a playlist.');
    }

    const playlistFiles = Array.from(files ?? []).filter(Boolean);
    if (!playlistFiles.length) {
      throw new Error('Choose one or more audio files.');
    }

    const formData = new FormData();
    playlistFiles.forEach((file) => {
      formData.append('tracks', file);
    });

    const response = await fetch(createRoomPlaylistUploadUrl(this.url, roomId), {
      method: 'POST',
      headers: {
        'X-Socket-Id': socket.id
      },
      body: formData
    });
    const payload = await readJsonResponse(response);

    if (!response.ok || !payload?.ok) {
      const roomError = payload?.error ?? {
        code: 'audio_upload_failed',
        message: 'Audio upload failed.'
      };
      this.applyEvent({ type: 'room:error', error: roomError });
      throw new Error(roomError.message);
    }

    if (payload.state) {
      this.applyEvent({ type: 'room:state', state: payload.state });
    }
    this.applyEvent({ type: 'playlist:updated', payload });

    this.emit('playlist:updated', this.getState());
    return this.getState();
  }

  resolveMediaUrl(url) {
    return new URL(String(url ?? ''), getAbsoluteBaseUrl(this.url)).href;
  }

  bindSocketEvents() {
    this.socket.on('connect', () => {
      this.applyEvent({ type: 'connected' });
      this.emit('connected', this.getState());
    });

    this.socket.on('connect_error', (error) => {
      this.applyEvent({ type: 'connect_error', error });
      this.emit('connection:error', this.getState());
      this.emit('error', this.getState());
    });

    this.socket.on('disconnect', (reason) => {
      this.applyEvent({
        type: 'disconnected',
        error: reason ? { code: 'disconnected', message: String(reason) } : null
      });
      this.emit('disconnected', this.getState());
    });

    this.socket.on('room:state', (state) => {
      this.applyEvent({ type: 'room:state', state });
      this.emit('room:state', this.getState());
    });

    this.socket.on('playlist:updated', (payload) => {
      this.applyEvent({ type: 'playlist:updated', payload });
      this.emit('playlist:updated', this.getState());
    });

    this.socket.on('concert:start', (concertState) => {
      this.applyEvent({ type: 'concert:start', concertState });
      this.emit('concert:start', this.getState());
    });

    this.socket.on('concert:pause', (concertState) => {
      this.applyEvent({ type: 'concert:pause', concertState });
      this.emit('concert:pause', this.getState());
    });

    this.socket.on('concert:resume', (concertState) => {
      this.applyEvent({ type: 'concert:resume', concertState });
      this.emit('concert:resume', this.getState());
    });

    this.socket.on('concert:stop', (concertState) => {
      this.applyEvent({ type: 'concert:stop', concertState });
      this.emit('concert:stop', this.getState());
    });

    this.socket.on('room:error', (error) => {
      this.applyEvent({ type: 'room:error', error });
      this.emit('error', this.getState());
    });

    this.socket.on('rooms:updated', (rooms) => {
      this.applyEvent({ type: 'rooms:updated', rooms });
      this.emit('rooms:updated', this.getState());
    });
  }

  async emitWithAck(eventName, payload) {
    const socket = await this.ensureConnected();

    return new Promise((resolve, reject) => {
      socket.timeout(this.timeoutMs).emit(eventName, payload, (error, response) => {
        if (error) {
          const roomError = normalizeConnectionError(error);
          this.applyEvent({ type: 'connect_error', error: roomError });
          reject(new Error(roomError.message));
          return;
        }

        if (!response?.ok) {
          const roomError = response?.error ?? {
            code: 'room_error',
            message: 'Room request failed.'
          };
          this.applyEvent({ type: 'room:error', error: roomError });
          reject(new Error(roomError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  ensureConnected() {
    const socket = this.connect({ autoStart: false });
    if (socket.connected) {
      return Promise.resolve(socket);
    }

    this.applyEvent({ type: 'connecting' });

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        socket.off?.('connect', handleConnect);
        socket.off?.('connect_error', handleConnectError);
        socket.off?.('disconnect', handleDisconnect);
      };

      const settle = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback();
      };

      const handleConnect = () => {
        settle(() => resolve(socket));
      };

      const handleConnectError = (error) => {
        const roomError = normalizeConnectionError(error);
        this.applyEvent({ type: 'connect_error', error: roomError });
        settle(() => reject(new Error(roomError.message)));
      };

      const handleDisconnect = (reason) => {
        const roomError = normalizeConnectionError(reason);
        this.applyEvent({ type: 'connect_error', error: roomError });
        settle(() => reject(new Error(roomError.message)));
      };

      socket.on('connect', handleConnect);
      socket.on('connect_error', handleConnectError);
      socket.on('disconnect', handleDisconnect);

      timeoutId = setTimeout(() => {
        const roomError = normalizeConnectionError();
        this.applyEvent({ type: 'connect_error', error: roomError });
        settle(() => reject(new Error(roomError.message)));
      }, this.timeoutMs);

      socket.connect();
    });
  }

  applyEvent(event) {
    this.state = reduceRoomClientState(this.state, event);
  }

  emit(eventName, payload) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }

    listeners.forEach((listener) => listener(payload));
  }
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createRoomPlaylistUploadUrl(baseUrl, roomId) {
  return new URL(`/api/rooms/${encodeURIComponent(roomId)}/playlist`, getAbsoluteBaseUrl(baseUrl)).href;
}

function getAbsoluteBaseUrl(baseUrl) {
  if (typeof window !== 'undefined') {
    return new URL(baseUrl, window.location.origin).href;
  }

  return baseUrl;
}

function getDefaultRoomServerUrl() {
  const envUrl = import.meta.env?.VITE_ROOM_SERVER_URL;
  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const { origin, port } = window.location;
    if (port && port !== '5173' && port !== '4173') {
      return origin;
    }
  }

  return 'http://localhost:3001';
}

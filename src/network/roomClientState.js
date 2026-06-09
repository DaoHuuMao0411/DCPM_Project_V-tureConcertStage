import {
  DEFAULT_ROOM_SERVER_OFFLINE_MESSAGE,
  createDefaultConcertState,
  normalizeConcertState,
  normalizeConnectionError,
  normalizeRoomList,
  normalizeRoomState
} from './roomStateNormalizer.js';

export const ROOM_SERVER_OFFLINE_MESSAGE = DEFAULT_ROOM_SERVER_OFFLINE_MESSAGE;

export function createInitialRoomClientState() {
  return {
    isConnected: false,
    isConnecting: false,
    roomId: null,
    name: 'Local',
    role: 'local',
    isHost: false,
    userCount: 1,
    playlist: [],
    concertState: createDefaultConcertState(),
    rooms: [],
    error: null
  };
}

export function reduceRoomClientState(state = createInitialRoomClientState(), event = {}) {
  switch (event.type) {
    case 'connecting':
      return {
        ...state,
        isConnecting: true,
        error: null
      };
    case 'connected':
      return {
        ...state,
        isConnected: true,
        isConnecting: false,
        error: null
      };
    case 'connect_error':
      return {
        ...state,
        isConnected: false,
        isConnecting: false,
        error: normalizeConnectionError(event.error)
      };
    case 'disconnected':
      return {
        ...createInitialRoomClientState(),
        isConnected: false,
        error: event.error ?? null
      };
    case 'room:state':
      return normalizeRoomState(event.state, state, createInitialRoomClientState);
    case 'playlist:updated':
      return normalizeRoomState(
        {
          ...state,
          playlist: event.payload?.playlist ?? event.playlist ?? state.playlist,
          concertState: event.payload?.concertState ?? event.concertState ?? state.concertState
        },
        state,
        createInitialRoomClientState
      );
    case 'concert:start':
    case 'concert:pause':
    case 'concert:resume':
    case 'concert:stop':
      return {
        ...state,
        concertState: normalizeConcertState(
          event.concertState ?? event.payload?.concertState ?? event.payload,
          state.concertState
        ),
        error: null
      };
    case 'room:error':
      return {
        ...state,
        ...(event.error?.code === 'room_closed'
          ? {
              roomId: null,
              role: 'local',
              isHost: false,
              userCount: 1
            }
          : null),
        error: event.error ?? { code: 'room_error', message: 'Room error.' }
      };
    case 'rooms:updated':
      return {
        ...state,
        rooms: normalizeRoomList(event.rooms),
        error: null
      };
    default:
      return state;
  }
}

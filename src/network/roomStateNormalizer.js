export const DEFAULT_TRACK_LABEL = 'No track selected';
export const DEFAULT_IMAGE_KEY = 'generated-pulse-loop';
export const DEFAULT_ROOM_NAME = 'Untitled Room';
export const DEFAULT_ROOM_SERVER_OFFLINE_MESSAGE = 'Room server offline. Start it with npm run dev:server.';

export function createDefaultConcertState() {
  return {
    roomId: null,
    currentTrackId: null,
    isPlaying: false,
    status: 'stopped',
    playbackTime: 0,
    startedAt: null,
    pausedAt: null,
    stoppedAt: null,
    updatedAt: null,
    serverTime: null,
    trackLabel: DEFAULT_TRACK_LABEL,
    imageKey: DEFAULT_IMAGE_KEY
  };
}

export function normalizeRoomState(roomState, previousState, createInitialState) {
  if (!roomState) {
    return {
      ...createInitialState(),
      isConnected: previousState.isConnected
    };
  }

  const concertState = normalizeConcertState(
    roomState.concertState ?? roomState.concert ?? roomState,
    previousState.concertState
  );
  return {
    ...previousState,
    roomId: roomState.roomId ?? concertState.roomId ?? null,
    name: String(roomState.name ?? previousState.name ?? DEFAULT_ROOM_NAME),
    role: roomState.role === 'host' ? 'host' : 'audience',
    isHost: Boolean(roomState.isHost || roomState.role === 'host'),
    userCount: Math.max(1, Number(roomState.userCount) || 1),
    playlist: normalizePlaylist(roomState.playlist ?? previousState.playlist),
    concertState,
    error: null
  };
}

export function normalizeConcertState(concertState, previousConcertState) {
  const previous = previousConcertState ?? createDefaultConcertState();
  const isPlaying = Boolean(concertState?.isPlaying);
  const currentTrackId = normalizeTrackId(concertState?.currentTrackId ?? previous.currentTrackId);
  return {
    roomId: concertState?.roomId ?? previous.roomId ?? null,
    currentTrackId,
    isPlaying,
    status: concertState?.status ?? (isPlaying ? 'playing' : 'stopped'),
    playbackTime: normalizePlaybackTime(concertState?.playbackTime, previous.playbackTime),
    startedAt: normalizeTimestamp(concertState?.startedAt, previous.startedAt),
    pausedAt: normalizeTimestamp(concertState?.pausedAt, previous.pausedAt),
    stoppedAt: normalizeTimestamp(concertState?.stoppedAt, previous.stoppedAt),
    updatedAt: normalizeTimestamp(concertState?.updatedAt, previous.updatedAt),
    serverTime: normalizeTimestamp(concertState?.serverTime, previous.serverTime),
    trackLabel: String(concertState?.trackLabel ?? previous.trackLabel ?? DEFAULT_TRACK_LABEL),
    imageKey: String(concertState?.imageKey ?? previous.imageKey ?? DEFAULT_IMAGE_KEY)
  };
}

export function normalizeRoomList(rooms) {
  return (Array.isArray(rooms) ? rooms : []).map((room) => ({
    roomId: String(room.roomId ?? ''),
    code: String(room.code ?? room.roomId ?? ''),
    name: String(room.name ?? DEFAULT_ROOM_NAME),
    isPermanent: Boolean(room.isPermanent),
    userCount: Math.max(0, Number(room.userCount) || 0),
    status: normalizeRoomStatus(room.status),
    isPlaying: Boolean(room.isPlaying || room.status === 'playing'),
    hostPresent: room.hostPresent !== false,
    createdAt: normalizeTimestamp(room.createdAt, null),
    trackLabel: String(room.trackLabel ?? DEFAULT_TRACK_LABEL),
    playlistCount: Math.max(0, Number(room.playlistCount) || 0),
    hasPlaylist: Boolean(room.hasPlaylist || Number(room.playlistCount) > 0),
    currentTrackId: normalizeTrackId(room.currentTrackId)
  })).filter((room) => room.roomId);
}

export function normalizePlaylist(playlist) {
  return (Array.isArray(playlist) ? playlist : []).map(normalizeTrack).filter(Boolean);
}

export function normalizeTrack(track) {
  if (!track || !track.id || !track.url) {
    return null;
  }

  return {
    id: String(track.id),
    title: String(track.title ?? track.originalName ?? 'Audio track'),
    originalName: String(track.originalName ?? track.title ?? 'Audio track'),
    storedName: String(track.storedName ?? ''),
    url: String(track.url),
    mimeType: String(track.mimeType ?? ''),
    size: Math.max(0, Number(track.size) || 0),
    uploadedAt: normalizeTimestamp(track.uploadedAt, null),
    uploadedBy: String(track.uploadedBy ?? '')
  };
}

export function normalizeTrackId(trackId) {
  const normalizedTrackId = String(trackId ?? '').trim();
  return normalizedTrackId || null;
}

export function normalizeRoomStatus(status) {
  return ['playing', 'paused', 'stopped'].includes(status) ? status : 'stopped';
}

export function normalizePlaybackTime(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.max(0, Number(fallback) || 0);
  }

  return Math.max(0, number);
}

export function normalizeTimestamp(value, fallback) {
  if (value === null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback ?? null;
}

export function normalizeConnectionError(error) {
  if (error?.code && error?.message) {
    return {
      code: String(error.code),
      message: String(error.message)
    };
  }

  return {
    code: 'server_offline',
    message: DEFAULT_ROOM_SERVER_OFFLINE_MESSAGE
  };
}

export function cloneRoomClientState(state) {
  return {
    ...state,
    concertState: {
      ...state.concertState
    },
    playlist: state.playlist.map((track) => ({ ...track })),
    rooms: state.rooms.map((room) => ({ ...room })),
    error: state.error ? { ...state.error } : null
  };
}

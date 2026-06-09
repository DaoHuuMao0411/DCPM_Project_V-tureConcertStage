export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_ROOM_CODE_LENGTH = 6;
export const DEFAULT_TRACK_LABEL = 'No track selected';
export const DEFAULT_ROOM_NAME = 'Untitled Room';
export const DEFAULT_ROOM_NAME_MAX_LENGTH = 40;
export const PERMANENT_HOST_ROOM_CODE = 'HOST';
export const PERMANENT_HOST_ROOM_NAME = 'HOST';
export const DEFAULT_IMAGE_KEY = 'generated-pulse-loop';

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

export class RoomManager {
  constructor(options = {}) {
    this.rooms = new Map();
    this.socketRooms = new Map();
    this.codeLength = options.codeLength ?? DEFAULT_ROOM_CODE_LENGTH;
    this.codeGenerator = options.codeGenerator ?? null;
    this.trackIdGenerator = options.trackIdGenerator ?? null;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.permanentRoomCode = normalizeRoomId(options.permanentRoomCode ?? PERMANENT_HOST_ROOM_CODE);
    this.includePermanentRoom = options.includePermanentRoom !== false;

    if (this.includePermanentRoom) {
      this.ensurePermanentHostRoom();
    }
  }

  createRoom(hostSocketId, participant = {}, roomOptions = {}) {
    const socketId = normalizeSocketId(hostSocketId);
    const roomId = this.generateUniqueRoomId();
    const room = createRoomRecord({
      roomId,
      name: normalizeRoomName(roomOptions.name ?? roomOptions.roomName),
      isPermanent: false,
      hostSocketId: socketId,
      createdAt: this.now()
    });

    room.participants.set(socketId, createParticipant(socketId, 'host', participant, this.now()));
    this.rooms.set(roomId, room);
    this.socketRooms.set(socketId, roomId);

    return this.getRoomState(roomId, socketId);
  }

  joinRoom(roomId, socketId, participant = {}) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const normalizedSocketId = normalizeSocketId(socketId);
    const room = this.getRequiredRoom(normalizedRoomId);
    const shouldBecomeHost = room.isPermanent && !room.hostSocketId;

    room.participants.set(
      normalizedSocketId,
      createParticipant(normalizedSocketId, shouldBecomeHost ? 'host' : 'audience', participant, this.now())
    );
    if (shouldBecomeHost) {
      room.hostSocketId = normalizedSocketId;
    }
    this.socketRooms.set(normalizedSocketId, normalizedRoomId);

    return this.getRoomState(normalizedRoomId, normalizedSocketId);
  }

  leaveRoom(roomId, socketId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const normalizedSocketId = normalizeSocketId(socketId);
    const room = this.getRequiredRoom(normalizedRoomId);

    if (room.hostSocketId === normalizedSocketId && !room.isPermanent) {
      return this.closeRoom(normalizedRoomId, 'host_left');
    }

    room.participants.delete(normalizedSocketId);
    this.socketRooms.delete(normalizedSocketId);

    if (room.participants.size === 0) {
      if (room.isPermanent) {
        this.resetPermanentRoom(room);
        return { type: 'empty_permanent', roomId: normalizedRoomId };
      }

      this.rooms.delete(normalizedRoomId);
      return { type: 'empty', roomId: normalizedRoomId };
    }

    if (room.isPermanent && room.hostSocketId === normalizedSocketId) {
      this.assignNextPermanentHost(room);
      return {
        type: 'host_transferred',
        roomId: normalizedRoomId,
        roomState: this.getRoomState(normalizedRoomId)
      };
    }

    return {
      type: 'left',
      roomId: normalizedRoomId,
      roomState: this.getRoomState(normalizedRoomId)
    };
  }

  disconnectSocket(socketId) {
    const normalizedSocketId = normalizeSocketId(socketId);
    const roomId = this.socketRooms.get(normalizedSocketId);
    if (!roomId) {
      return { type: 'none' };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.socketRooms.delete(normalizedSocketId);
      return { type: 'none' };
    }

    if (room.hostSocketId === normalizedSocketId && !room.isPermanent) {
      return this.closeRoom(roomId, 'host_disconnected');
    }

    room.participants.delete(normalizedSocketId);
    this.socketRooms.delete(normalizedSocketId);

    if (room.participants.size === 0) {
      if (room.isPermanent) {
        this.resetPermanentRoom(room);
        return { type: 'empty_permanent', roomId };
      }

      this.rooms.delete(roomId);
      return { type: 'empty', roomId };
    }

    if (room.isPermanent && room.hostSocketId === normalizedSocketId) {
      this.assignNextPermanentHost(room);
      return {
        type: 'host_transferred',
        roomId,
        roomState: this.getRoomState(roomId)
      };
    }

    return {
      type: 'left',
      roomId,
      roomState: this.getRoomState(roomId)
    };
  }

  addPlaylistTracks(roomId, socketId, tracks = []) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    const uploadedAt = this.now();
    const normalizedTracks = normalizeTrackList(tracks, {
      uploadedAt,
      uploadedBy: socketId,
      createId: () => this.generateTrackId(room)
    });

    if (!normalizedTracks.length) {
      throw new RoomError('missing_audio_file', 'Attach at least one audio file.');
    }

    room.playlist.push(...normalizedTracks);
    room.playback.serverTime = this.now();
    room.playback.updatedAt = room.playback.serverTime;
    return this.getRoomState(room.roomId, socketId);
  }

  selectTrack(roomId, socketId, trackId) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    const track = getRequiredPlaylistTrack(room, trackId);
    const now = this.now();

    room.playback = {
      ...room.playback,
      roomId: room.roomId,
      currentTrackId: track.id,
      isPlaying: false,
      status: 'stopped',
      playbackTime: 0,
      startedAt: null,
      pausedAt: null,
      stoppedAt: now,
      updatedAt: now,
      serverTime: now,
      trackLabel: getTrackTitle(track),
      imageKey: normalizeImageKey(getTrackTitle(track))
    };

    return this.getRoomState(room.roomId, socketId);
  }

  startConcert(roomId, socketId, payload = {}) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    const track = getRequiredCurrentTrack(room);
    const now = this.now();
    const playbackTime = normalizePlaybackTime(payload.playbackTime, 0);

    room.playback = {
      ...room.playback,
      roomId: room.roomId,
      currentTrackId: track.id,
      isPlaying: true,
      status: 'playing',
      playbackTime,
      startedAt: now,
      pausedAt: null,
      stoppedAt: null,
      updatedAt: now,
      serverTime: now,
      trackLabel: getTrackTitle(track),
      imageKey: normalizeImageKey(payload.imageKey ?? getTrackTitle(track))
    };

    return this.getRoomState(room.roomId, socketId);
  }

  pauseConcert(roomId, socketId, payload = {}) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    getRequiredCurrentTrack(room);
    const now = this.now();
    const playbackTime = normalizePlaybackTime(
      payload.playbackTime,
      getEffectivePlaybackTime(room.playback, now)
    );

    room.playback = {
      ...room.playback,
      roomId: room.roomId,
      isPlaying: false,
      status: 'paused',
      playbackTime,
      pausedAt: now,
      stoppedAt: null,
      updatedAt: now,
      serverTime: now
    };

    return this.getRoomState(room.roomId, socketId);
  }

  resumeConcert(roomId, socketId, payload = {}) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    const track = getRequiredCurrentTrack(room);
    const now = this.now();
    const playbackTime = normalizePlaybackTime(payload.playbackTime, room.playback.playbackTime);

    room.playback = {
      ...room.playback,
      roomId: room.roomId,
      currentTrackId: track.id,
      isPlaying: true,
      status: 'playing',
      playbackTime,
      startedAt: now,
      pausedAt: null,
      stoppedAt: null,
      updatedAt: now,
      serverTime: now,
      trackLabel: getTrackTitle(track)
    };

    return this.getRoomState(room.roomId, socketId);
  }

  stopConcert(roomId, socketId) {
    const room = this.getAuthorizedHostRoom(roomId, socketId);
    const now = this.now();
    room.playback = {
      ...room.playback,
      roomId: room.roomId,
      isPlaying: false,
      status: 'stopped',
      playbackTime: 0,
      startedAt: null,
      pausedAt: null,
      stoppedAt: now,
      updatedAt: now,
      serverTime: now
    };

    return this.getRoomState(room.roomId, socketId);
  }

  getRoom(roomId) {
    return this.rooms.get(normalizeRoomId(roomId)) ?? null;
  }

  getSocketRoomId(socketId) {
    return this.socketRooms.get(normalizeSocketId(socketId)) ?? null;
  }

  getRoomState(roomId, viewerSocketId = null) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.getRequiredRoom(normalizedRoomId);
    const viewerId = viewerSocketId ? normalizeSocketId(viewerSocketId) : null;
    const isHost = viewerId ? viewerId === room.hostSocketId : false;
    const playlist = clonePlaylist(room.playlist);
    const concertState = createPlaybackStateSnapshot(room.playback, normalizedRoomId, this.now(), room.playlist);

    return {
      roomId: normalizedRoomId,
      roomCode: normalizedRoomId,
      code: normalizedRoomId,
      name: room.name,
      isPermanent: Boolean(room.isPermanent),
      role: isHost ? 'host' : 'audience',
      isHost,
      userCount: room.participants.size,
      participants: Array.from(room.participants.values()).map((participant) => ({
        socketId: participant.socketId,
        role: participant.role,
        joinedAt: participant.joinedAt
      })),
      playlist,
      concertState,
      concert: concertState,
      isPlaying: concertState.isPlaying,
      status: concertState.status,
      playbackTime: concertState.playbackTime,
      currentTrackId: concertState.currentTrackId,
      startedAt: concertState.startedAt,
      pausedAt: concertState.pausedAt,
      stoppedAt: concertState.stoppedAt,
      trackLabel: concertState.trackLabel,
      imageKey: concertState.imageKey
    };
  }

  getRoomCount() {
    return this.rooms.size;
  }

  listPublicRooms() {
    return Array.from(this.rooms.values())
      .map((room) => {
        const currentTrack = getPlaylistTrack(room, room.playback.currentTrackId);
        return {
          roomId: room.roomId,
          roomCode: room.roomId,
          code: room.roomId,
          name: room.name,
          isPermanent: Boolean(room.isPermanent),
          userCount: room.participants.size,
          status: room.playback.isPlaying ? 'playing' : room.playback.status,
          isPlaying: room.playback.isPlaying,
          hostPresent: room.hostSocketId ? room.participants.has(room.hostSocketId) : false,
          createdAt: room.createdAt,
          playlistCount: room.playlist.length,
          hasPlaylist: room.playlist.length > 0,
          currentTrackId: room.playback.currentTrackId,
          trackLabel: currentTrack ? getTrackTitle(currentTrack) : DEFAULT_TRACK_LABEL
        };
      })
      .sort((left, right) => {
        if (left.isPermanent !== right.isPermanent) {
          return left.isPermanent ? -1 : 1;
        }
        return left.createdAt - right.createdAt;
      });
  }

  generateUniqueRoomId() {
    for (let attempts = 0; attempts < 1000; attempts += 1) {
      const roomId = normalizeRoomId(
        this.codeGenerator ? this.codeGenerator() : createRandomRoomCode(this.codeLength, this.random)
      );
      if (roomId && !this.rooms.has(roomId)) {
        return roomId;
      }
    }

    throw new RoomError('room_code_exhausted', 'Unable to generate a unique room code.');
  }

  generateTrackId(room) {
    for (let attempts = 0; attempts < 1000; attempts += 1) {
      const candidate = String(
        this.trackIdGenerator
          ? this.trackIdGenerator()
          : `track_${this.now().toString(36)}_${Math.floor(this.random() * 1_000_000).toString(36)}`
      );
      if (candidate && !room.playlist.some((track) => track.id === candidate)) {
        return candidate;
      }
    }

    throw new RoomError('track_id_exhausted', 'Unable to generate a unique track id.');
  }

  getRequiredRoom(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      throw new RoomError('missing_room_code', 'Enter a room code.');
    }

    const room = this.rooms.get(normalizedRoomId);
    if (!room) {
      throw new RoomError('room_not_found', 'Room not found.');
    }

    return room;
  }

  getAuthorizedHostRoom(roomId, socketId) {
    const room = this.getRequiredRoom(roomId);
    if (room.hostSocketId !== normalizeSocketId(socketId)) {
      throw new RoomError('host_only', 'Only the room host can control the concert.');
    }

    return room;
  }

  closeRoom(roomId, reason = 'room_closed') {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.getRequiredRoom(normalizedRoomId);
    const participantSocketIds = Array.from(room.participants.keys());

    participantSocketIds.forEach((socketId) => this.socketRooms.delete(socketId));

    if (room.isPermanent) {
      room.participants.clear();
      this.resetPermanentRoom(room);
      return {
        type: 'empty_permanent',
        roomId: normalizedRoomId,
        reason,
        participantSocketIds
      };
    }

    this.rooms.delete(normalizedRoomId);
    return {
      type: 'closed',
      roomId: normalizedRoomId,
      reason,
      participantSocketIds
    };
  }

  ensurePermanentHostRoom() {
    if (this.rooms.has(this.permanentRoomCode)) {
      return this.rooms.get(this.permanentRoomCode);
    }

    const room = createRoomRecord({
      roomId: this.permanentRoomCode,
      name: PERMANENT_HOST_ROOM_NAME,
      isPermanent: true,
      hostSocketId: null,
      createdAt: this.now()
    });
    this.rooms.set(room.roomId, room);
    return room;
  }

  resetPermanentRoom(room) {
    room.hostSocketId = null;
    room.playlist = [];
    room.playback = createStoppedConcertState();
  }

  assignNextPermanentHost(room) {
    const [nextSocketId] = room.participants.keys();
    room.hostSocketId = nextSocketId ?? null;
    room.participants.forEach((participant, socketId) => {
      participant.role = socketId === room.hostSocketId ? 'host' : 'audience';
    });
  }
}

export function createStoppedConcertState(currentTrackId = null) {
  return {
    roomId: null,
    currentTrackId,
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

export function createRandomRoomCode(length = DEFAULT_ROOM_CODE_LENGTH, random = Math.random) {
  const safeLength = Math.max(1, Math.floor(Number(length) || DEFAULT_ROOM_CODE_LENGTH));
  let code = '';
  for (let index = 0; index < safeLength; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomId(roomId) {
  return String(roomId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeRoomName(roomName, maxLength = DEFAULT_ROOM_NAME_MAX_LENGTH) {
  const normalizedMaxLength = Math.max(1, Math.floor(Number(maxLength) || DEFAULT_ROOM_NAME_MAX_LENGTH));
  const trimmed = String(roomName ?? '').trim();
  const safeName = trimmed || DEFAULT_ROOM_NAME;
  return safeName.slice(0, normalizedMaxLength);
}

function createRoomRecord({ roomId, name, isPermanent, hostSocketId, createdAt }) {
  return {
    roomId,
    code: roomId,
    name,
    isPermanent,
    hostSocketId,
    createdAt,
    participants: new Map(),
    playlist: [],
    playback: createStoppedConcertState()
  };
}

function normalizeSocketId(socketId) {
  const normalizedSocketId = String(socketId ?? '').trim();
  if (!normalizedSocketId) {
    throw new RoomError('missing_socket', 'Missing socket id.');
  }
  return normalizedSocketId;
}

function createParticipant(socketId, role, participant, joinedAt) {
  return {
    socketId,
    role,
    name: String(participant.name ?? '').trim(),
    joinedAt
  };
}

function normalizeTrackList(tracks, context) {
  return (Array.isArray(tracks) ? tracks : [])
    .map((track) => normalizeTrack(track, context))
    .filter(Boolean);
}

function normalizeTrack(track, context) {
  const url = String(track?.url ?? '').trim();
  const storedName = String(track?.storedName ?? '').trim();
  if (!url || !storedName) {
    return null;
  }

  const originalName = String(track.originalName ?? 'Audio track').trim() || 'Audio track';
  const timestamp = Number(track.uploadedAt ?? context.uploadedAt);
  const id = String(track.id ?? '').trim() || context.createId();
  return {
    id,
    originalName,
    title: stripExtension(originalName) || 'Audio track',
    storedName,
    url,
    mimeType: String(track.mimeType ?? '').trim(),
    size: Math.max(0, Number(track.size) || 0),
    uploadedAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
    uploadedBy: String(track.uploadedBy ?? context.uploadedBy ?? '').trim()
  };
}

function getPlaylistTrack(room, trackId) {
  const normalizedTrackId = String(trackId ?? '').trim();
  if (!normalizedTrackId) {
    return null;
  }
  return room.playlist.find((track) => track.id === normalizedTrackId) ?? null;
}

function getRequiredPlaylistTrack(room, trackId) {
  const track = getPlaylistTrack(room, trackId);
  if (!track) {
    throw new RoomError('track_not_found', 'Track not found in this room playlist.');
  }
  return track;
}

function getRequiredCurrentTrack(room) {
  if (!room.playback.currentTrackId) {
    throw new RoomError('missing_track', 'Select a playlist track before starting playback.');
  }
  return getRequiredPlaylistTrack(room, room.playback.currentTrackId);
}

function createPlaybackStateSnapshot(playback, roomId, now, playlist) {
  const currentTrack = playlist.find((track) => track.id === playback.currentTrackId) ?? null;
  const playbackTime = playback.isPlaying
    ? getEffectivePlaybackTime(playback, now)
    : normalizePlaybackTime(playback.playbackTime, 0);

  return {
    ...playback,
    roomId,
    roomCode: roomId,
    currentTrackId: currentTrack?.id ?? null,
    isPlaying: Boolean(playback.isPlaying && currentTrack),
    status: currentTrack ? playback.status : 'stopped',
    playbackTime,
    serverTime: now,
    trackLabel: currentTrack ? getTrackTitle(currentTrack) : DEFAULT_TRACK_LABEL
  };
}

function getEffectivePlaybackTime(playback, now) {
  const basePlaybackTime = normalizePlaybackTime(playback?.playbackTime, 0);
  if (!playback?.isPlaying) {
    return basePlaybackTime;
  }

  const startedAt = Number(playback.startedAt);
  if (!Number.isFinite(startedAt)) {
    return basePlaybackTime;
  }

  return Math.max(0, basePlaybackTime + Math.max(0, now - startedAt) / 1000);
}

function normalizePlaybackTime(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.max(0, Number(fallback) || 0);
  }

  return Math.max(0, number);
}

function normalizeImageKey(imageKey) {
  const key = String(imageKey ?? '').trim();
  return key || DEFAULT_IMAGE_KEY;
}

function getTrackTitle(track) {
  return track?.title || stripExtension(track?.originalName) || 'Audio track';
}

function stripExtension(fileName) {
  return String(fileName ?? '').replace(/\.[^/.\\]+$/, '');
}

function clonePlaylist(playlist) {
  return playlist.map((track) => ({ ...track }));
}

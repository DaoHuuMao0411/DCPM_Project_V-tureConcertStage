import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomError, RoomManager } from './roomManager.js';
import {
  PLAYLIST_UPLOAD_FIELD,
  createAudioUploadMiddleware,
  createUploadUrl,
  deleteRoomUploadDirectory,
  deleteUploadedFile,
  getAudioUploadHttpStatus,
  isAudioUploadError,
  normalizeAudioUploadError,
  sanitizeDisplayName
} from './uploadService.js';

export { deleteRoomUploadDirectory } from './uploadService.js';

const DEFAULT_PORT = 3001;
const DEFAULT_DEV_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATIC_DIR = resolve(SERVER_DIR, '..', 'dist');
const DEFAULT_UPLOAD_ROOT = resolve(SERVER_DIR, 'uploads');

export function createRoomServer(options = {}) {
  const app = express();
  const httpServer = createServer(app);
  const roomManager = options.roomManager ?? new RoomManager();
  const corsOrigins = options.corsOrigin ?? getDefaultClientOrigins(options.port ?? DEFAULT_PORT);
  const uploadRoot = resolve(options.uploadRoot ?? DEFAULT_UPLOAD_ROOT);
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins
    }
  });
  const upload = createAudioUploadMiddleware(uploadRoot);

  mkdirSync(uploadRoot, { recursive: true });
  app.use(createCorsMiddleware(corsOrigins));

  app.get('/health', (request, response) => {
    response.json({
      ok: true,
      rooms: roomManager.getRoomCount()
    });
  });

  app.use('/uploads', express.static(uploadRoot, {
    acceptRanges: true,
    fallthrough: false
  }));

  app.post('/api/rooms/:roomCode/playlist', authorizeHostUpload, runPlaylistUpload, async (request, response) => {
    const uploadedFiles = Array.isArray(request.files) ? request.files : [];
    if (!uploadedFiles.length) {
      sendJsonError(response, new RoomError('missing_audio_file', 'Attach audio files in the tracks field.'));
      return;
    }

    const { roomId, socketId } = request.audioUpload;
    const uploadedAt = roomManager.now();
    const tracks = uploadedFiles.map((uploadedFile) => ({
      originalName: sanitizeDisplayName(uploadedFile.originalname),
      storedName: uploadedFile.filename,
      url: createUploadUrl(request, roomId, uploadedFile.filename, uploadedAt),
      mimeType: uploadedFile.mimetype,
      size: uploadedFile.size,
      uploadedAt,
      uploadedBy: socketId
    }));

    try {
      const state = roomManager.addPlaylistTracks(roomId, socketId, tracks);
      const payload = createPlaylistUpdatedPayload(state);

      io.to(state.roomId).emit('playlist:updated', payload);
      emitRoomState(state.roomId);
      emitRoomsUpdated();
      response.json({
        ok: true,
        state,
        playlist: state.playlist,
        concertState: state.concertState,
        ...payload
      });
    } catch (error) {
      await Promise.all(uploadedFiles.map((uploadedFile) => deleteUploadedFile(uploadedFile.path)));
      sendJsonError(response, error);
    }
  });

  const staticDir = options.staticDir ?? DEFAULT_STATIC_DIR;
  if (options.serveStatic !== false && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!socket\.io).*/, (request, response) => {
      response.sendFile(resolve(staticDir, 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    socket.emit('rooms:updated', roomManager.listPublicRooms());

    socket.on('rooms:list', (payload = {}, callback) => {
      sendAck(callback, {
        ok: true,
        rooms: roomManager.listPublicRooms()
      });
    });

    socket.on('room:create', (payload = {}, callback) => {
      try {
        leaveCurrentRoom(socket, 'switch_room');
        const state = roomManager.createRoom(socket.id, payload.participant, {
          name: payload.name ?? payload.roomName
        });
        socket.join(state.roomId);
        socket.data.roomId = state.roomId;
        sendAck(callback, { ok: true, state });
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('room:join', (payload = {}, callback) => {
      try {
        leaveCurrentRoom(socket, 'switch_room');
        const state = roomManager.joinRoom(payload.roomId, socket.id, payload.participant);
        socket.join(state.roomId);
        socket.data.roomId = state.roomId;
        sendAck(callback, { ok: true, state });
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('room:leave', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        if (!roomId) {
          sendAck(callback, { ok: true, state: null });
          return;
        }

        const result = roomManager.leaveRoom(roomId, socket.id);
        socket.leave(roomId);
        socket.data.roomId = null;
        sendAck(callback, { ok: true, state: null });
        handleRoomChangeResult(result);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('room:state', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomId ? roomManager.getRoomState(roomId, socket.id) : null;
        sendAck(callback, { ok: true, state });
        if (state) {
          socket.emit('room:state', state);
        }
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('concert:start', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomManager.startConcert(roomId, socket.id, payload);
        const concertState = state.concertState;
        sendAck(callback, { ok: true, state, concertState });
        io.to(state.roomId).emit('concert:start', concertState);
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('concert:select-track', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomManager.selectTrack(roomId, socket.id, payload.trackId);
        const concertState = state.concertState;
        sendAck(callback, { ok: true, state, concertState });
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('concert:pause', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomManager.pauseConcert(roomId, socket.id, payload);
        const concertState = state.concertState;
        sendAck(callback, { ok: true, state, concertState });
        io.to(state.roomId).emit('concert:pause', concertState);
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('concert:resume', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomManager.resumeConcert(roomId, socket.id, payload);
        const concertState = state.concertState;
        sendAck(callback, { ok: true, state, concertState });
        io.to(state.roomId).emit('concert:resume', concertState);
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('concert:stop', (payload = {}, callback) => {
      try {
        const roomId = payload.roomId ?? socket.data.roomId;
        const state = roomManager.stopConcert(roomId, socket.id);
        const concertState = state.concertState;
        sendAck(callback, { ok: true, state, concertState });
        io.to(state.roomId).emit('concert:stop', concertState);
        emitRoomState(state.roomId);
        emitRoomsUpdated();
      } catch (error) {
        emitRoomError(socket, error, callback);
      }
    });

    socket.on('disconnect', () => {
      const result = roomManager.disconnectSocket(socket.id);
      handleRoomChangeResult(result);
      emitRoomsUpdated();
    });
  });

  function leaveCurrentRoom(socket, reason) {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const result = roomManager.leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    socket.data.roomId = null;
    handleRoomChangeResult({ ...result, reason });
  }

  function emitRoomState(roomId) {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return;
    }

    room.participants.forEach((participant, socketId) => {
      io.to(socketId).emit('room:state', roomManager.getRoomState(roomId, socketId));
    });
  }

  function emitRoomsUpdated() {
    io.emit('rooms:updated', roomManager.listPublicRooms());
  }

  function authorizeHostUpload(request, response, next) {
    try {
      const socketId = getUploadSocketId(request);
      const room = roomManager.getAuthorizedHostRoom(request.params.roomCode, socketId);
      request.audioUpload = {
        roomId: room.roomId,
        socketId
      };
      next();
    } catch (error) {
      sendJsonError(response, error);
    }
  }

  function runPlaylistUpload(request, response, next) {
    request.audioUpload.nextFileIndex = 0;
    upload.array(PLAYLIST_UPLOAD_FIELD)(request, response, (error) => {
      if (error) {
        sendJsonError(response, error);
        return;
      }

      next();
    });
  }

  function handleRoomChangeResult(result) {
    if (!result || result.type === 'none') {
      return;
    }

    if (result.type === 'closed' || result.type === 'empty' || result.type === 'empty_permanent') {
      deleteRoomUploadDirectory(uploadRoot, result.roomId).catch(() => {});
    }

    if (result.type === 'closed') {
      result.participantSocketIds.forEach((socketId) => {
        const participantSocket = io.sockets.sockets.get(socketId);
        participantSocket?.leave(result.roomId);
        if (participantSocket) {
          participantSocket.data.roomId = null;
          participantSocket.emit('room:error', {
            code: 'room_closed',
            message: getRoomClosedMessage(result.reason),
            roomId: result.roomId
          });
          participantSocket.emit('room:state', null);
        }
      });
      return;
    }

    if (result.roomId) {
      emitRoomState(result.roomId);
    }
  }

  return { app, httpServer, io, roomManager };
}

function emitRoomError(socket, error, callback) {
  const normalizedError = normalizeError(error);
  socket.emit('room:error', normalizedError);
  sendAck(callback, { ok: false, error: normalizedError });
}

function sendJsonError(response, error) {
  response.status(getHttpStatusForError(error)).json({
    ok: false,
    error: normalizeError(error)
  });
}

function sendAck(callback, payload) {
  if (typeof callback === 'function') {
    callback(payload);
  }
}

function normalizeError(error) {
  if (error instanceof RoomError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (isAudioUploadError(error)) {
    return normalizeAudioUploadError(error);
  }

  return {
    code: 'server_error',
    message: 'Room server error.'
  };
}

function getHttpStatusForError(error) {
  const uploadStatus = getAudioUploadHttpStatus(error);
  if (uploadStatus) {
    return uploadStatus;
  }

  if (error instanceof RoomError) {
    if (error.code === 'room_not_found') {
      return 404;
    }

    if (error.code === 'host_only') {
      return 403;
    }

    return 400;
  }

  return 500;
}

function getUploadSocketId(request) {
  const socketId = String(request.get('x-socket-id') ?? '').trim();
  if (!socketId) {
    throw new RoomError('missing_socket', 'Missing room host socket id.');
  }

  return socketId;
}

function createPlaylistUpdatedPayload(state) {
  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    playlist: state.playlist,
    concertState: state.concertState
  };
}

function createCorsMiddleware(corsOrigins) {
  const allowedOrigins = normalizeCorsOrigins(corsOrigins);

  return (request, response, next) => {
    const origin = request.headers.origin;
    if (isOriginAllowed(origin, allowedOrigins)) {
      response.setHeader('Access-Control-Allow-Origin', origin ?? '*');
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Socket-Id');
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}

function normalizeCorsOrigins(corsOrigins) {
  if (corsOrigins === '*') {
    return '*';
  }

  return new Set((Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins]).filter(Boolean));
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  return allowedOrigins === '*' || allowedOrigins.has(origin);
}

function getRoomClosedMessage(reason) {
  if (reason === 'host_disconnected') {
    return 'Host disconnected; room closed.';
  }

  if (reason === 'host_left') {
    return 'Host left; room closed.';
  }

  return 'Room closed.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const corsOrigins = parseCorsOrigins(process.env.CLIENT_ORIGIN) ?? getDefaultClientOrigins(port);
  const { httpServer } = createRoomServer({
    corsOrigin: corsOrigins,
    port
  });

  httpServer.listen(port, () => {
    console.log(`Room server listening on http://localhost:${port}`);
    if (existsSync(DEFAULT_STATIC_DIR)) {
      console.log(`Serving built client from ${DEFAULT_STATIC_DIR}`);
      console.log(`Open http://localhost:${port}`);
    }
    console.log(`Allowed client origins: ${corsOrigins.join(', ')}`);
  });
}

function parseCorsOrigins(value) {
  if (!value) {
    return null;
  }

  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function getDefaultClientOrigins(port = DEFAULT_PORT) {
  return [
    ...DEFAULT_DEV_CLIENT_ORIGINS,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ];
}

import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm, unlink } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { RoomError } from './roomManager.js';

export const PLAYLIST_UPLOAD_FIELD = 'tracks';

const MAX_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/x-mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'application/ogg'
]);

export function createAudioUploadMiddleware(uploadRoot) {
  const storage = multer.diskStorage({
    destination(request, file, callback) {
      try {
        const roomId = request.audioUpload?.roomId;
        if (!roomId) {
          throw new RoomError('missing_room_code', 'Enter a room code.');
        }

        const roomUploadDir = resolve(uploadRoot, 'rooms', roomId);
        if (!isPathInside(uploadRoot, roomUploadDir)) {
          throw new RoomError('invalid_room_code', 'Invalid room code.');
        }

        mkdirSync(roomUploadDir, { recursive: true });
        callback(null, roomUploadDir);
      } catch (error) {
        callback(error);
      }
    },
    filename(request, file, callback) {
      const extension = getAllowedAudioExtension(file);
      if (!extension) {
        callback(new RoomError('invalid_audio_type', 'Upload an MP3, WAV, OGG, or M4A audio file.'));
        return;
      }

      const uploadIndex = request.audioUpload.nextFileIndex;
      request.audioUpload.nextFileIndex += 1;
      callback(null, `track_${Date.now()}_${uploadIndex}_${randomUUID()}${extension}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_AUDIO_UPLOAD_BYTES,
      files: 24
    },
    fileFilter(request, file, callback) {
      if (!getAllowedAudioExtension(file) || !hasAllowedAudioMime(file)) {
        callback(new RoomError('invalid_audio_type', 'Upload an MP3, WAV, OGG, or M4A audio file.'));
        return;
      }

      callback(null, true);
    }
  });
}

export function getAllowedAudioExtension(file) {
  const extension = extname(String(file?.originalname ?? '')).toLowerCase();
  return ALLOWED_AUDIO_EXTENSIONS.has(extension) ? extension : null;
}

export function hasAllowedAudioMime(file) {
  const mimeType = String(file?.mimetype ?? '').toLowerCase();
  return mimeType.startsWith('audio/') || ALLOWED_AUDIO_MIME_TYPES.has(mimeType);
}

export function createUploadUrl(request, roomId, fileName, uploadedAt) {
  const encodedRoomId = encodeURIComponent(roomId);
  const encodedFileName = encodeURIComponent(fileName);
  return `/uploads/rooms/${encodedRoomId}/${encodedFileName}?v=${uploadedAt}`;
}

export async function deleteRoomUploadDirectory(uploadRoot, roomId) {
  const normalizedRoomId = String(roomId ?? '').trim();
  if (!normalizedRoomId) {
    return;
  }

  const roomsUploadRoot = resolve(uploadRoot, 'rooms');
  const roomUploadDir = resolve(roomsUploadRoot, normalizedRoomId);
  if (
    !isPathInside(uploadRoot, roomUploadDir)
    || !isPathInside(roomsUploadRoot, roomUploadDir)
    || resolve(roomUploadDir) === roomsUploadRoot
  ) {
    return;
  }

  await rm(roomUploadDir, { recursive: true, force: true });
}

export async function deleteUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  await unlink(filePath).catch(() => {});
}

export function sanitizeDisplayName(fileName) {
  const normalized = String(fileName ?? 'Audio track')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, 120) || 'Audio track';
}

export function isPathInside(basePath, targetPath) {
  const relativePath = relative(resolve(basePath), resolve(targetPath));
  return !relativePath || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function isAudioUploadError(error) {
  return error instanceof multer.MulterError;
}

export function normalizeAudioUploadError(error) {
  if (!isAudioUploadError(error)) {
    return null;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      code: 'audio_file_too_large',
      message: 'Audio file must be 50 MB or smaller.'
    };
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      code: 'invalid_audio_field',
      message: 'Upload audio files using the tracks field.'
    };
  }

  return {
    code: 'invalid_audio_upload',
    message: 'Audio upload failed.'
  };
}

export function getAudioUploadHttpStatus(error) {
  if (!isAudioUploadError(error)) {
    return null;
  }

  return error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
}

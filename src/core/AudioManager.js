import * as THREE from 'three';
import { AudioReactivity } from './AudioReactivity.js';
import { calculateFrequencyBands } from './FrequencyBands.js';

export const DEFAULT_LISTENER_HEIGHT = 1.65;
export const LISTENER_SOURCE_AVATAR = 'avatar';

const MEDIA_METADATA_TIMEOUT_MS = 30000;
const SPATIAL_AUDIO = {
  refDistance: 8,
  rolloffFactor: 1.35,
  maxDistance: 80,
  coneInnerAngle: 72,
  coneOuterAngle: 150,
  coneOuterGain: 0.28,
  routeGain: 0.72,
  clearLowpassHz: 18000,
  occludedLowpassHz: 950,
  occludedGain: 0.52,
  occlusionSmoothing: 0.14,
  occlusionTimeConstant: 0.12,
  occlusionRayPadding: 0.18,
  paramSmoothingSeconds: 0.015,
  reverbDurationSeconds: 1.8,
  reverbDecay: 2.65,
  reverbSendGain: 0.12,
  reverbReturnGain: 0.24
};

const _speakerWorldPosition = new THREE.Vector3();
const _speakerWorldDirection = new THREE.Vector3();
const _listenerWorldPosition = new THREE.Vector3();
const _audioRayDirection = new THREE.Vector3();
const _listenerForward = new THREE.Vector3();
const _listenerUp = new THREE.Vector3(0, 1, 0);

export class AudioManager {
  constructor(options = {}) {
    const normalizedOptions = normalizeOptions(options);
    this.listenerHeight = normalizedOptions.listenerHeight;
    this.listenerSource = LISTENER_SOURCE_AVATAR;
    this.listenerRig = new THREE.Object3D();
    this.listenerRig.name = 'AvatarAudioListenerRig';
    this.listener = new THREE.AudioListener();
    this.listenerRig.add(this.listener);
    this.context = this.listener.context;
    this.audioElement = createAudioElement();
    this.mediaElementSource = this.context.createMediaElementSource(this.audioElement);
    this.sourceInput = this.context.createGain();
    this.masterGain = this.context.createGain();
    this.analyserNode = this.context.createAnalyser();
    this.venueReverb = createVenueReverb(this.context);
    this.reactivity = new AudioReactivity();
    this.isPlaying = false;
    this.masterVolume = 0.8;
    this.listenerDiagnostics = createListenerDiagnostics(this.listenerHeight);
    this.loadedSourceUrl = null;
    this.loadedSourceKey = null;
    this.loadedObjectUrl = null;
    this.speakerAnchors = [];
    this.speakerRoutes = [];
    this.mediaStatus = createMediaStatus();
    this.spatialDiagnostics = createSpatialDiagnostics();

    this.analyserNode.fftSize = 128;
    this.analyserNode.smoothingTimeConstant = 0.82;
    this.frequencyBinCount = this.analyserNode.frequencyBinCount;
    this.frequencyScratch = new Uint8Array(this.frequencyBinCount);
    this.masterGain.gain.value = this.masterVolume;
    this.mediaElementSource.connect(this.sourceInput);
    this.sourceInput.connect(this.analyserNode);
    this.sourceInput.connect(this.venueReverb.input);
    this.venueReverb.output.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    this.bindMediaEvents();
  }

  getListenerObject() {
    return this.listenerRig;
  }

  getAudioListener() {
    return this.listener;
  }

  updateListenerFromAvatar(avatar) {
    const position = avatar?.getPosition?.() ?? avatar?.group?.position ?? avatar?.position;
    const facingYaw = avatar?.group?.rotation?.y ?? avatar?.rotation?.y ?? avatar?.facingYaw ?? 0;
    return this.updateListenerTransform(position, facingYaw);
  }

  updateListenerTransform(position, facingYaw = 0) {
    const sourcePosition = sanitizePosition(position);
    const yaw = sanitizeNumber(facingYaw, 0);
    const forward = getAvatarForwardFromYaw(yaw);

    this.listenerRig.position.set(
      sourcePosition.x,
      sourcePosition.y + this.listenerHeight,
      sourcePosition.z
    );
    // Avatar visuals face local +Z; the native Web Audio listener follows that direction.
    this.listenerRig.rotation.set(0, getListenerRigYawFromFacingYaw(yaw), 0);
    this.listenerRig.updateMatrixWorld(true);
    this.updateAudioContextListener(this.listenerRig.position, forward, _listenerUp);

    this.listenerDiagnostics = {
      source: this.listenerSource,
      position: vectorToPlainObject(this.listenerRig.position),
      avatarPosition: vectorToPlainObject(sourcePosition),
      heightOffset: this.listenerHeight,
      facingYaw: yaw,
      rigYaw: this.listenerRig.rotation.y,
      forward: vectorToPlainObject(forward),
      isCameraAttached: hasCameraAncestor(this.listener)
    };
    return this.getListenerDiagnostics();
  }

  getListenerDiagnostics() {
    return {
      ...this.listenerDiagnostics,
      position: { ...this.listenerDiagnostics.position },
      avatarPosition: { ...this.listenerDiagnostics.avatarPosition },
      forward: { ...this.listenerDiagnostics.forward }
    };
  }

  attachSpeakers(speakerAnchors = []) {
    this.speakerAnchors = Array.isArray(speakerAnchors) ? speakerAnchors.filter(Boolean) : [];
    this.rebuildSpeakerRoutes();
    this.updateSpeakerRoutes();
  }

  async loadFile(file) {
    if (!file) {
      throw new Error('Choose an audio file.');
    }

    const title = String(file.name ?? 'Audio track').replace(/\.[^/.]+$/, '') || 'Audio track';
    const objectUrl = URL.createObjectURL(file);
    try {
      return await this.loadUrl(objectUrl, {
        cacheKey: [
          'local-file',
          file.name ?? 'audio',
          file.size ?? 0,
          file.lastModified ?? 0
        ].join('|'),
        objectUrl,
        title
      });
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async loadUrl(url, options = {}) {
    const sourceUrl = String(url ?? '').trim();
    if (!sourceUrl) {
      throw new Error('Missing audio URL.');
    }

    const cacheKey = String(options.cacheKey ?? sourceUrl);
    if (this.loadedSourceKey === cacheKey && this.audioElement.currentSrc) {
      return options.title ?? getTitleFromUrl(sourceUrl);
    }

    this.stop();
    this.releaseObjectUrl();
    this.loadedSourceUrl = sourceUrl;
    this.loadedSourceKey = cacheKey;
    this.loadedObjectUrl = options.objectUrl ?? null;
    this.mediaStatus = {
      ...createMediaStatus(),
      sourceUrl,
      sourceKey: cacheKey,
      title: options.title ?? getTitleFromUrl(sourceUrl),
      state: 'loading',
      isLoading: true
    };

    this.audioElement.src = sourceUrl;
    this.audioElement.preload = 'auto';
    this.audioElement.load();
    await waitForMediaMetadata(this.audioElement);
    this.updateMediaStatus('metadata');
    return this.mediaStatus.title;
  }

  async ensureReady() {
    if (this.context.state !== 'running') {
      await this.context.resume();
    }

    if (!this.audioElement.currentSrc) {
      throw new Error('Choose an audio track before starting playback.');
    }
  }

  async play(options = {}) {
    await this.ensureReady();

    if (this.isPlaying && !options.restart && options.offsetSeconds === undefined) {
      return;
    }

    if (options.restart) {
      this.audioElement.pause();
    }

    if (options.offsetSeconds !== undefined) {
      this.seek(options.offsetSeconds);
    }

    await this.resume();
  }

  async resume() {
    await this.ensureReady();

    try {
      await this.audioElement.play();
      this.isPlaying = true;
      this.updateMediaStatus('playing');
    } catch (error) {
      this.isPlaying = false;
      this.updateMediaStatus('play-rejected', error);
      throw error;
    }
  }

  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
    this.updateMediaStatus('paused');
  }

  stop() {
    this.audioElement.pause();
    this.isPlaying = false;
    this.seek(0, { silent: true });
    this.updateMediaStatus(this.audioElement.currentSrc ? 'stopped' : 'idle');
  }

  seek(seconds, options = {}) {
    if (!this.audioElement.currentSrc || this.audioElement.readyState < HTMLMediaElement.HAVE_METADATA) {
      return;
    }

    const duration = this.getDuration();
    const target = getPlayableOffsetSeconds(seconds, duration);
    try {
      this.audioElement.currentTime = target;
    } catch {
      if (!options.silent) {
        this.updateMediaStatus('seek-blocked');
      }
    }
  }

  getCurrentTime() {
    return sanitizeNumber(this.audioElement.currentTime, 0);
  }

  getDuration() {
    const duration = Number(this.audioElement.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
      return false;
    }

    return this.play().then(() => true);
  }

  setMasterVolume(value) {
    this.masterVolume = clamp(Number(value), 0, 1);
    this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.015);
  }

  setAScoreTuning(tuning) {
    this.reactivity.setTuning(tuning);
  }

  getReactivityMetrics() {
    return this.reactivity.getMetrics();
  }

  getAudioMetrics(deltaTime) {
    if (!this.isPlaying) {
      return this.reactivity.updateSilence(deltaTime);
    }

    this.analyserNode.getByteFrequencyData(this.frequencyScratch);
    return this.reactivity.updateFromFrequencyData(this.frequencyScratch, deltaTime);
  }

  copyFrequencyData(targetArray) {
    if (!targetArray || typeof targetArray.length !== 'number') {
      return 0;
    }

    targetArray.fill(0);

    if (!this.isPlaying) {
      return 0;
    }

    this.analyserNode.getByteFrequencyData(this.frequencyScratch);
    const count = Math.min(targetArray.length, this.frequencyScratch.length);
    targetArray.set(this.frequencyScratch.subarray(0, count), 0);
    return count;
  }

  copyFrequencyBands(targetBands, sourceData = null, sourceCount = 0) {
    const target = targetBands ?? {};

    if (sourceData) {
      return calculateFrequencyBands(sourceData, target, sourceCount || sourceData.length);
    }

    const count = this.copyFrequencyData(this.frequencyScratch);
    return calculateFrequencyBands(this.frequencyScratch, target, count);
  }

  updateSpatialOcclusion(collisionManager = null) {
    this.updateSpeakerRoutes(collisionManager);
  }

  getSpatialDiagnostics() {
    return {
      ...this.spatialDiagnostics,
      routes: this.spatialDiagnostics.routes.map((route) => ({ ...route }))
    };
  }

  getMediaStatus() {
    return {
      ...this.mediaStatus
    };
  }

  dispose() {
    this.stop();
    this.unbindMediaEvents();
    this.disposeSpeakerRoutes();
    this.mediaElementSource.disconnect();
    this.sourceInput.disconnect();
    this.venueReverb.dispose();
    this.masterGain.disconnect();
    this.analyserNode.disconnect();
    this.audioElement.removeAttribute('src');
    this.audioElement.load();
    this.releaseObjectUrl();
    this.speakerAnchors = [];
  }

  bindMediaEvents() {
    this.mediaEventHandlers = new Map([
      ['loadedmetadata', () => this.updateMediaStatus('metadata')],
      ['canplay', () => this.updateMediaStatus('canplay')],
      ['playing', () => {
        this.isPlaying = true;
        this.updateMediaStatus('playing');
      }],
      ['waiting', () => this.updateMediaStatus('waiting')],
      ['stalled', () => this.updateMediaStatus('stalled')],
      ['ended', () => {
        this.isPlaying = false;
        this.updateMediaStatus('ended');
      }],
      ['error', () => {
        this.isPlaying = false;
        this.updateMediaStatus('error', getMediaElementError(this.audioElement));
      }]
    ]);

    this.mediaEventHandlers.forEach((handler, eventName) => {
      this.audioElement.addEventListener(eventName, handler);
    });
  }

  unbindMediaEvents() {
    this.mediaEventHandlers?.forEach((handler, eventName) => {
      this.audioElement.removeEventListener(eventName, handler);
    });
    this.mediaEventHandlers = new Map();
  }

  updateMediaStatus(state, error = null) {
    const isBuffering = state === 'waiting' || state === 'stalled';
    this.mediaStatus = {
      ...this.mediaStatus,
      state,
      isLoading: state === 'loading',
      isReady: this.audioElement.readyState >= HTMLMediaElement.HAVE_METADATA,
      isBuffering,
      error: error ? normalizePlaybackError(error) : null,
      duration: this.getDuration()
    };
  }

  releaseObjectUrl() {
    if (this.loadedObjectUrl) {
      URL.revokeObjectURL(this.loadedObjectUrl);
      this.loadedObjectUrl = null;
    }
  }

  rebuildSpeakerRoutes() {
    this.disposeSpeakerRoutes();

    this.speakerRoutes = this.speakerAnchors.map((anchor) => {
      const gain = this.context.createGain();
      const occlusionFilter = this.context.createBiquadFilter();
      const occlusionGain = this.context.createGain();
      const panner = this.context.createPanner();

      configureSpeakerPanner(panner);
      configureOcclusionFilter(occlusionFilter);
      gain.gain.value = SPATIAL_AUDIO.routeGain;
      occlusionGain.gain.value = 1;
      this.sourceInput.connect(gain);
      gain.connect(occlusionFilter);
      occlusionFilter.connect(occlusionGain);
      occlusionGain.connect(panner);
      panner.connect(this.masterGain);

      return {
        anchor,
        gain,
        occlusionFilter,
        occlusionGain,
        panner,
        occlusionAmount: 0,
        isOccluded: false,
        occlusionHitName: null,
        occlusionHitType: null
      };
    });
    this.spatialDiagnostics = createSpatialDiagnostics(this.speakerRoutes.length);
  }

  disposeSpeakerRoutes() {
    this.speakerRoutes.forEach((route) => {
      safeDisconnect(this.sourceInput, route.gain);
      safeDisconnect(route.gain);
      safeDisconnect(route.occlusionFilter);
      safeDisconnect(route.occlusionGain);
      safeDisconnect(route.panner);
    });
    this.speakerRoutes = [];
    this.spatialDiagnostics = createSpatialDiagnostics();
  }

  updateSpeakerRoutes(collisionManager = null) {
    const currentTime = this.context.currentTime;
    this.listenerRig.getWorldPosition(_listenerWorldPosition);

    this.speakerRoutes.forEach((route) => {
      route.anchor.updateMatrixWorld(true);
      route.anchor.getWorldPosition(_speakerWorldPosition);
      _speakerWorldDirection.setFromMatrixColumn(route.anchor.matrixWorld, 2).normalize();

      setAudioPosition(route.panner, _speakerWorldPosition, currentTime);
      setAudioOrientation(route.panner, _speakerWorldDirection, currentTime);
      this.updateRouteOcclusion(route, collisionManager, currentTime);
    });
    this.updateSpatialDiagnostics();
  }

  updateRouteOcclusion(route, collisionManager, currentTime) {
    const hit = getSpeakerOcclusionHit(route.anchor, _listenerWorldPosition, collisionManager);
    const targetOcclusion = hit ? 1 : 0;
    route.occlusionAmount +=
      (targetOcclusion - route.occlusionAmount) * SPATIAL_AUDIO.occlusionSmoothing;
    route.isOccluded = Boolean(hit);
    route.occlusionHitName = hit?.box?.name ?? hit?.box?.id ?? null;
    route.occlusionHitType = hit?.box?.type ?? null;

    const amount = clamp(route.occlusionAmount, 0, 1);
    const lowpassHz = lerp(getClearLowpassHz(this.context), SPATIAL_AUDIO.occludedLowpassHz, amount);
    const gain = lerp(1, SPATIAL_AUDIO.occludedGain, amount);
    route.occlusionFilter.frequency.setTargetAtTime(
      lowpassHz,
      currentTime,
      SPATIAL_AUDIO.occlusionTimeConstant
    );
    route.occlusionGain.gain.setTargetAtTime(
      gain,
      currentTime,
      SPATIAL_AUDIO.occlusionTimeConstant
    );
  }

  updateSpatialDiagnostics() {
    const routes = this.speakerRoutes.map((route, index) => ({
      index,
      isOccluded: route.isOccluded,
      occlusionAmount: route.occlusionAmount,
      occlusionHitName: route.occlusionHitName,
      occlusionHitType: route.occlusionHitType
    }));
    this.spatialDiagnostics = {
      isOccluded: routes.some((route) => route.isOccluded),
      routes
    };
  }

  updateAudioContextListener(position, forward, up) {
    const audioListener = this.context.listener;
    const currentTime = this.context.currentTime;
    _listenerForward.copy(forward).normalize();

    if (audioListener.positionX) {
      setAudioParam(audioListener.positionX, position.x, currentTime);
      setAudioParam(audioListener.positionY, position.y, currentTime);
      setAudioParam(audioListener.positionZ, position.z, currentTime);
      setAudioParam(audioListener.forwardX, _listenerForward.x, currentTime);
      setAudioParam(audioListener.forwardY, _listenerForward.y, currentTime);
      setAudioParam(audioListener.forwardZ, _listenerForward.z, currentTime);
      setAudioParam(audioListener.upX, up.x, currentTime);
      setAudioParam(audioListener.upY, up.y, currentTime);
      setAudioParam(audioListener.upZ, up.z, currentTime);
      return;
    }

    audioListener.setPosition?.(position.x, position.y, position.z);
    audioListener.setOrientation?.(
      _listenerForward.x,
      _listenerForward.y,
      _listenerForward.z,
      up.x,
      up.y,
      up.z
    );
  }
}

function configureSpeakerPanner(panner) {
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = SPATIAL_AUDIO.refDistance;
  panner.rolloffFactor = SPATIAL_AUDIO.rolloffFactor;
  panner.maxDistance = SPATIAL_AUDIO.maxDistance;
  panner.coneInnerAngle = SPATIAL_AUDIO.coneInnerAngle;
  panner.coneOuterAngle = SPATIAL_AUDIO.coneOuterAngle;
  panner.coneOuterGain = SPATIAL_AUDIO.coneOuterGain;
}

function configureOcclusionFilter(filter) {
  filter.type = 'lowpass';
  filter.frequency.value = getClearLowpassHz(filter.context);
  filter.Q.value = 0.8;
}

function createVenueReverb(context) {
  const input = context.createGain();
  const convolver = context.createConvolver();
  const output = context.createGain();
  convolver.buffer = createVenueImpulseResponse(
    context,
    SPATIAL_AUDIO.reverbDurationSeconds,
    SPATIAL_AUDIO.reverbDecay
  );
  input.gain.value = SPATIAL_AUDIO.reverbSendGain;
  output.gain.value = SPATIAL_AUDIO.reverbReturnGain;
  input.connect(convolver);
  convolver.connect(output);

  return {
    input,
    convolver,
    output,
    dispose() {
      safeDisconnect(input);
      safeDisconnect(convolver);
      safeDisconnect(output);
      convolver.buffer = null;
    }
  };
}

function createVenueImpulseResponse(context, durationSeconds, decay) {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      const envelope = Math.pow(1 - t, decay);
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}

function getSpeakerOcclusionHit(anchor, listenerPosition, collisionManager) {
  if (!collisionManager) {
    return null;
  }

  anchor.getWorldPosition(_speakerWorldPosition);
  _audioRayDirection.subVectors(listenerPosition, _speakerWorldPosition);
  const distance = _audioRayDirection.length();
  if (distance <= 0.001) {
    return null;
  }

  _audioRayDirection.multiplyScalar(1 / distance);
  const hits = collisionManager.raycastAllAABB(_speakerWorldPosition, _audioRayDirection, distance);
  return hits.find((hit) => isAudioOccludingHit(hit, distance)) ?? null;
}

function isAudioOccludingHit(hit, totalDistance) {
  const box = hit?.box;
  if (!box) {
    return false;
  }

  if (
    hit.distance <= SPATIAL_AUDIO.occlusionRayPadding ||
    hit.distance >= totalDistance - SPATIAL_AUDIO.occlusionRayPadding
  ) {
    return false;
  }

  if (box.type === 'speaker' || box.isWalkableRamp || box.isWalkableSurface) {
    return false;
  }

  return ['screen', 'wall', 'stage', 'barrier', 'audience-seating'].includes(box.type);
}

function createSpatialDiagnostics(routeCount = 0) {
  return {
    isOccluded: false,
    routes: Array.from({ length: routeCount }, (_, index) => ({
      index,
      isOccluded: false,
      occlusionAmount: 0,
      occlusionHitName: null,
      occlusionHitType: null
    }))
  };
}

function setAudioPosition(panner, position, currentTime) {
  if (panner.positionX) {
    setAudioParam(panner.positionX, position.x, currentTime);
    setAudioParam(panner.positionY, position.y, currentTime);
    setAudioParam(panner.positionZ, position.z, currentTime);
    return;
  }

  panner.setPosition?.(position.x, position.y, position.z);
}

function setAudioOrientation(panner, direction, currentTime) {
  if (panner.orientationX) {
    setAudioParam(panner.orientationX, direction.x, currentTime);
    setAudioParam(panner.orientationY, direction.y, currentTime);
    setAudioParam(panner.orientationZ, direction.z, currentTime);
    return;
  }

  panner.setOrientation?.(direction.x, direction.y, direction.z);
}

function setAudioParam(param, value, currentTime) {
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, currentTime, SPATIAL_AUDIO.paramSmoothingSeconds);
    return;
  }

  param.value = value;
}

function safeDisconnect(node, target = null) {
  try {
    if (target) {
      node.disconnect(target);
    } else {
      node.disconnect();
    }
  } catch {
    // The route may already be disconnected during graph rebuild/dispose.
  }
}

function getClearLowpassHz(context) {
  return Math.min(SPATIAL_AUDIO.clearLowpassHz, context.sampleRate / 2);
}

function createAudioElement() {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.loop = true;
  audio.controls = false;
  return audio;
}

function createMediaStatus() {
  return {
    sourceUrl: null,
    sourceKey: null,
    title: 'No track selected',
    state: 'idle',
    isLoading: false,
    isReady: false,
    isBuffering: false,
    error: null,
    duration: 0
  };
}

function waitForMediaMetadata(audioElement) {
  if (audioElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Audio metadata load timed out.'));
    }, MEDIA_METADATA_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      audioElement.removeEventListener('loadedmetadata', handleReady);
      audioElement.removeEventListener('canplay', handleReady);
      audioElement.removeEventListener('error', handleError);
    };

    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(getMediaElementError(audioElement));
    };

    audioElement.addEventListener('loadedmetadata', handleReady);
    audioElement.addEventListener('canplay', handleReady);
    audioElement.addEventListener('error', handleError);
  });
}

function getMediaElementError(audioElement) {
  const mediaError = audioElement.error;
  if (!mediaError) {
    return new Error('Audio playback failed.');
  }

  const messageByCode = {
    1: 'Audio loading was aborted.',
    2: 'Audio loading failed because of a network error.',
    3: 'The browser could not decode this audio file.',
    4: 'This audio format is not supported by the browser.'
  };
  return new Error(messageByCode[mediaError.code] ?? 'Audio playback failed.');
}

function normalizePlaybackError(error) {
  return {
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? 'Audio playback failed.')
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * clamp(amount, 0, 1);
}

function getPlayableOffsetSeconds(offsetSeconds = 0, duration = 0) {
  const offset = Math.max(0, Number(offsetSeconds) || 0);
  const mediaDuration = Number(duration) || 0;

  if (mediaDuration <= 0) {
    return offset;
  }

  return offset % mediaDuration;
}

function getTitleFromUrl(url) {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const pathName = new URL(url, baseUrl).pathname;
    const fileName = decodeURIComponent(pathName.split('/').pop() ?? '');
    return fileName.replace(/\.[^/.]+$/, '') || 'Audio track';
  } catch {
    return 'Audio track';
  }
}

export function getAvatarForwardFromYaw(facingYaw) {
  const yaw = sanitizeNumber(facingYaw, 0);
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

export function getListenerRigYawFromFacingYaw(facingYaw) {
  return sanitizeNumber(facingYaw, 0) + Math.PI;
}

function createListenerDiagnostics(heightOffset) {
  return {
    source: LISTENER_SOURCE_AVATAR,
    position: { x: 0, y: heightOffset, z: 0 },
    avatarPosition: { x: 0, y: 0, z: 0 },
    heightOffset,
    facingYaw: 0,
    rigYaw: Math.PI,
    forward: { x: 0, y: 0, z: 1 },
    isCameraAttached: false
  };
}

function normalizeOptions(options) {
  const listenerHeight = sanitizeNumber(options?.listenerHeight, DEFAULT_LISTENER_HEIGHT);
  return {
    listenerHeight: Math.max(0, listenerHeight)
  };
}

function sanitizePosition(position) {
  return new THREE.Vector3(
    sanitizeNumber(position?.x, 0),
    sanitizeNumber(position?.y, 0),
    sanitizeNumber(position?.z, 0)
  );
}

function sanitizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vectorToPlainObject(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function hasCameraAncestor(object) {
  let current = object?.parent ?? null;
  while (current) {
    if (current.isCamera) {
      return true;
    }
    current = current.parent ?? null;
  }
  return false;
}

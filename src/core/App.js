import { ConcertState } from './ConcertState.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { CameraController } from './CameraController.js';
import { AudioManager } from './AudioManager.js';
import { CollisionManager } from './CollisionManager.js';
import { CollisionDebugView } from './CollisionDebugView.js';
import { AvatarVisibilityManager } from './AvatarVisibilityManager.js';
import { SettingsManager } from './SettingsManager.js';
import { resolveAudioImage } from './AudioImageMapper.js';
import { DiagnosticsHistory } from './DiagnosticsHistory.js';
import {
  ThrottledTask,
  buildPerformanceDiagnostics,
  countSceneObjects
} from './PerformanceDiagnostics.js';
import { PLAYER, WORLD } from '../utils/constants.js';
import { Avatar } from '../entities/Avatar.js';
import { Stage } from '../entities/Stage.js';
import { BigScreen } from '../entities/BigScreen.js';
import { Audience } from '../entities/Audience.js';
import { SpeakerSystem } from '../entities/SpeakerSystem.js';
import { LightSystem } from '../entities/LightSystem.js';
import { ConcertHudView } from '../ui/ConcertHudView.js';
import { DiagnosticsPanel } from '../ui/DiagnosticsPanel.js';

export class App {
  constructor(root, options = {}) {
    this.root = root;
    this.concertState = new ConcertState();
    this.shell = document.createElement('div');
    this.shell.className = 'app-shell';
    this.root.appendChild(this.shell);

    this.sceneManager = new SceneManager(this.shell);
    this.inputManager = new InputManager(this.sceneManager.canvas);
    this.cameraController = new CameraController(this.sceneManager.camera, this.inputManager);
    this.audioManager = new AudioManager();
    this.collisionManager = new CollisionManager(PLAYER.radius);
    this.settingsManager = new SettingsManager();
    this.frequencyData = new Uint8Array(64);
    this.frequencyBands = { bass: 0, mids: 0, highs: 0 };
    this.latestAudioMetrics = null;
    this.diagnosticsHistory = new DiagnosticsHistory(180);
    this.historySeries = {
      aScore: new Float32Array(this.diagnosticsHistory.capacity)
    };
    this.historySnapshot = {
      count: 0,
      capacity: this.diagnosticsHistory.capacity,
      ...this.historySeries
    };
    this.handleGlobalKey = this.handleGlobalKey.bind(this);
    this.hudUpdateTask = new ThrottledTask(0.125);
    this.performanceUpdateTask = new ThrottledTask(0.25);
    this.performanceSample = {
      elapsed: 0,
      frames: 0,
      frameTimeTotalMs: 0
    };
    this.performanceDiagnostics = buildPerformanceDiagnostics();
    this.roomClient = options.roomClient ?? null;
    this.onExitToLobby = options.onExitToLobby ?? (() => {});
    this.roomState = options.initialRoomState ?? createLocalRoomState();
    this.currentPlaybackState = this.concertState.state;
    this.lastAppliedRoomConcertKey = '';
    this.roomConcertApplyVersion = 0;
    this.isCorrectingRoomDrift = false;
    this.isRunning = false;
    this.animationFrameId = null;
    this.roomUnsubscribers = [];
    this.roomDriftCorrectionTask = new ThrottledTask(2);

    this.stage = new Stage();
    this.bigScreen = new BigScreen();
    this.currentAudioImageInfo = resolveAudioImage('No track selected');
    this.bigScreen.setAudioImage(this.currentAudioImageInfo);
    this.audience = new Audience();
    this.speakers = new SpeakerSystem();
    this.lights = new LightSystem();
    this.avatar = new Avatar();
    this.avatarLookTarget = this.avatar.getPosition().clone();

    this.sceneManager.scene.add(
      this.stage.group,
      this.bigScreen.group,
      this.audience.group,
      this.speakers.group,
      this.lights.group,
      this.avatar.group,
      this.audioManager.getListenerObject()
    );
    this.audioManager.updateListenerFromAvatar(this.avatar);
    this.audioManager.attachSpeakers(this.speakers.getAudioAnchors());
    const halfFloor = WORLD.floorSize / 2;
    this.collisionManager.setBounds({
      minX: -halfFloor,
      maxX: halfFloor,
      minZ: -halfFloor,
      maxZ: halfFloor
    });
    this.collisionManager.addBoxes([
      ...this.stage.getCollisionBoxes(),
      ...this.speakers.getCollisionBoxes(),
      ...this.bigScreen.getCollisionBoxes()
    ]);
    this.collisionDebugView = new CollisionDebugView(this.sceneManager.scene, this.collisionManager);
    this.avatarVisibility = new AvatarVisibilityManager(this.collisionManager);
    this.avatarVisibility.registerTargets([
      ...this.stage.getVisibilityTargets(),
      ...this.speakers.getVisibilityTargets(),
      ...this.bigScreen.getVisibilityTargets()
    ]);

    this.hudView = new ConcertHudView(this.shell);
    this.diagnosticsPanel = new DiagnosticsPanel(this.hudView.element);
    this.bindState();
    this.bindSettings();
    this.bindInteractions();
  }

  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.animate();
  }

  destroy() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.audioManager.dispose();
    this.roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.roomUnsubscribers = [];
    window.removeEventListener('keydown', this.handleGlobalKey);
    this.shell.remove();
  }

  bindState() {
    this.concertState.subscribe((state) => {
      this.currentPlaybackState = state;
      this.hudView.updatePlaybackState(state);
      this.bigScreen.setSongTitle(state.songTitle);
      this.updateRoomUi();
    });
  }

  bindSettings() {
    this.settingsManager.subscribe((settings) => {
      this.cameraController.setMouseSensitivity(settings.mouseSensitivity);
      this.audioManager.setMasterVolume(settings.masterVolume);
      this.audioManager.setAScoreTuning(settings);
      this.audience.setReactionIntensity(settings.audienceReactionIntensity);
      this.hudView.updateSettings(settings);
    });

    this.hudView.settingInputs.forEach((input) => {
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const nextValue = input.type === 'checkbox' ? input.checked : input.value;
        this.settingsManager.set(input.dataset.setting, nextValue);
      });
    });

    this.hudView.resetSettingsButton.addEventListener('click', () => {
      this.settingsManager.reset();
    });
  }

  bindInteractions() {
    this.hudView.startButton.addEventListener('click', () => this.handlePlaybackControlClick());

    this.hudView.fileInput.addEventListener('change', (event) => this.handleAudioFileChange(event));
    this.hudView.setTrackSelectHandler((trackId) => this.handleRoomTrackSelect(trackId));

    this.hudView.roomLeaveButton.addEventListener('click', () => this.leaveRoom());
    this.bindRoomClient();
    window.addEventListener('keydown', this.handleGlobalKey);
  }

  bindRoomClient() {
    if (!this.roomClient) {
      this.updateRoomUi();
      return;
    }

    const syncRoomState = (roomState) => {
      this.roomState = roomState;
      this.updateRoomUi();
      this.applyRoomConcertState(roomState.concertState);
    };

    this.addRoomListener('room:state', syncRoomState);
    this.addRoomListener('playlist:updated', (roomState) => {
      syncRoomState(roomState);
      this.hudView.setToast(`Playlist updated for room ${roomState.roomId}.`);
    });
    this.addRoomListener('concert:start', (roomState) => {
      syncRoomState(roomState);
      this.hudView.setToast(`Concert started in room ${roomState.roomId}.`);
    });
    this.addRoomListener('concert:pause', (roomState) => {
      syncRoomState(roomState);
      this.hudView.setToast(`Concert paused in room ${roomState.roomId}.`);
    });
    this.addRoomListener('concert:resume', (roomState) => {
      syncRoomState(roomState);
      this.hudView.setToast(`Concert resumed in room ${roomState.roomId}.`);
    });
    this.addRoomListener('concert:stop', (roomState) => {
      syncRoomState(roomState);
      this.hudView.setToast(`Concert stopped in room ${roomState.roomId}.`);
    });
    this.addRoomListener('error', (roomState) => {
      this.roomState = roomState;
      this.updateRoomUi();
      this.hudView.setToast(roomState.error?.message ?? 'Room connection error.');
      if (!roomState.roomId && roomState.error?.code === 'room_closed') {
        this.exitToLobby(roomState.error.message);
      }
    });
    this.addRoomListener('disconnected', (roomState) => {
      this.roomState = roomState;
      this.updateRoomUi();
      this.hudView.setToast('Room server disconnected. Start it with npm run dev:server.');
      this.exitToLobby('Room server disconnected.');
    });
  }

  addRoomListener(eventName, listener) {
    this.roomUnsubscribers.push(this.roomClient.on(eventName, listener));
  }

  async handleAudioFileChange(event) {
    const files = Array.from(event.target.files ?? []);
    const [file] = files;
    if (!files.length) {
      return;
    }

    if (this.roomState.roomId && this.roomClient) {
      if (!this.roomState.isHost) {
        this.hudView.setToast('Audience clients follow the host playlist.');
        event.target.value = '';
        return;
      }

      try {
        this.hudView.setUploadStatus(`Uploading ${files.length} playlist track${files.length === 1 ? '' : 's'}...`);
        const roomState = await this.roomClient.uploadRoomPlaylist(files);
        this.roomState = roomState;
        this.updateRoomUi();
        await this.applyRoomConcertState(roomState.concertState);
        this.hudView.setToast(`Uploaded ${files.length} playlist track${files.length === 1 ? '' : 's'}.`);
      } catch (error) {
        this.hudView.setToast(error.message || 'Playlist upload failed.');
        this.hudView.setUploadStatus(error.message || 'Playlist upload failed.');
      } finally {
        event.target.value = '';
      }
      return;
    }

    try {
      const title = await this.audioManager.loadFile(file);
      this.concertState.setSong(title, true);
      this.currentAudioImageInfo = resolveAudioImage(file.name);
      this.bigScreen.setAudioImage(this.currentAudioImageInfo);
      this.concertState.setPlayback(false);
      this.hudView.setToast(`Loaded local audio: ${file.name}`);
    } catch (error) {
      this.hudView.setToast(error.message || 'Could not load local audio.');
    } finally {
      event.target.value = '';
    }
  }

  async handlePlaybackControlClick() {
    if (this.roomState.roomId && this.roomClient) {
      if (!this.roomState.isHost) {
        this.hudView.setToast('Audience clients follow the room host.');
        return;
      }

      if (!this.hasSelectedRoomTrack()) {
        this.hudView.setToast(this.roomState.playlist?.length ? 'Select a playlist track first.' : 'Upload playlist tracks first.');
        return;
      }

      try {
        const concertState = this.roomState.concertState ?? {};
        if (concertState.isPlaying) {
          await this.roomClient.pauseConcert({
            playbackTime: getExpectedPlaybackTime(concertState)
          });
        } else if (concertState.status === 'paused') {
          await this.roomClient.resumeConcert({
            playbackTime: concertState.playbackTime ?? 0
          });
        } else {
          await this.roomClient.startConcert(this.getRoomConcertPayload());
        }
      } catch (error) {
        this.hudView.setToast(error.message || 'Room concert control failed.');
      }
      return;
    }

    await this.toggleLocalConcert();
  }

  async handleRoomTrackSelect(trackId) {
    if (!this.roomState.roomId || !this.roomClient) {
      return;
    }

    if (!this.roomState.isHost) {
      this.hudView.setToast('Audience clients follow the host track selection.');
      return;
    }

    try {
      const roomState = await this.roomClient.selectRoomTrack(trackId);
      this.roomState = roomState;
      this.updateRoomUi();
      await this.applyRoomConcertState(roomState.concertState);
    } catch (error) {
      this.hudView.setToast(error.message || 'Could not select playlist track.');
    }
  }

  async toggleLocalConcert() {
    if (this.audioManager.isPlaying) {
      this.audioManager.stop();
      this.concertState.setPlayback(false);
      return;
    }

    try {
      await this.audioManager.play();
      this.concertState.setPlayback(true);
    } catch (error) {
      this.hudView.setToast(error.message || 'Could not start audio playback.');
      this.concertState.setPlayback(false);
    }
  }

  async leaveRoom() {
    try {
      if (this.roomState.roomId && this.roomClient) {
        await this.roomClient.leaveRoom();
        this.roomState = this.roomClient.getState();
      }
      this.audioManager.stop();
      this.concertState.setPlayback(false);
      this.lastAppliedRoomConcertKey = '';
      this.updateRoomUi();
      this.exitToLobby(this.roomState.error?.message ?? null);
    } catch (error) {
      this.hudView.setToast(error.message || 'Could not leave room.');
    }
  }

  exitToLobby(message = null) {
    this.onExitToLobby(message);
  }

  updateRoomUi() {
    const isInRoom = Boolean(this.roomState.roomId);
    const isAudience = isInRoom && !this.roomState.isHost;
    this.hudView.updateRoom({
      roomState: this.roomState,
      playlist: this.roomState.playlist ?? [],
      startButtonText: this.getStartButtonText(isAudience),
      uploadStatusText: this.getUploadStatusText(),
      isAudience
    });
  }

  getStartButtonText(isAudience) {
    if (isAudience) {
      return 'Host Controls Concert';
    }

    if (!this.roomState.roomId) {
      return this.currentPlaybackState.isPlaying ? 'Stop Concert' : 'Start Concert';
    }

    if (this.roomState.roomId && !this.hasSelectedRoomTrack()) {
      return this.roomState.playlist?.length ? 'Select Track' : 'Waiting for Playlist';
    }

    const concertState = this.roomState.concertState ?? {};
    if (this.roomState.roomId && concertState.isPlaying) {
      return 'Pause Concert';
    }

    if (this.roomState.roomId && concertState.status === 'paused') {
      return 'Resume Concert';
    }

    return 'Start Concert';
  }

  getUploadStatusText() {
    if (!this.roomState.roomId) {
      return '';
    }

    const selectedTrack = this.getSelectedRoomTrack();
    if (selectedTrack) {
      return `Selected track: ${selectedTrack.originalName ?? selectedTrack.title}`;
    }

    if (this.roomState.playlist?.length) {
      return this.roomState.isHost ? 'Select a playlist track.' : 'Waiting for host to select a track.';
    }

    return this.roomState.isHost ? 'Upload MP3, WAV, OGG, or M4A playlist tracks.' : 'Waiting for host playlist.';
  }

  hasSelectedRoomTrack() {
    return Boolean(this.getSelectedRoomTrack()?.url);
  }

  getSelectedRoomTrack() {
    const currentTrackId = this.roomState.concertState?.currentTrackId;
    return (this.roomState.playlist ?? []).find((track) => track.id === currentTrackId) ?? null;
  }

  getRoomConcertPayload() {
    return {
      imageKey: this.getCurrentAudioImageKey()
    };
  }

  getCurrentAudioImageKey() {
    const imageStatus = this.bigScreen.getAudioImageStatus();
    return imageStatus.label || this.currentAudioImageInfo?.label || imageStatus.source || 'placeholder';
  }

  async applyRoomConcertState(concertState) {
    if (!concertState || !this.roomState.roomId) {
      return;
    }

    const track = this.getSelectedRoomTrack();
    const trackTitle = getTrackDisplayTitle(concertState, track);
    const trackCacheKey = getTrackCacheKey(track);
    const signature = [
      this.roomState.roomId,
      concertState.currentTrackId ?? 'none',
      concertState.status ?? (concertState.isPlaying ? 'playing' : 'stopped'),
      concertState.startedAt ?? 'none',
      concertState.pausedAt ?? 'none',
      concertState.stoppedAt ?? 'none',
      Math.round((Number(concertState.playbackTime) || 0) * 100) / 100,
      trackCacheKey,
      trackTitle
    ].join(':');

    if (signature === this.lastAppliedRoomConcertKey) {
      return;
    }

    this.lastAppliedRoomConcertKey = signature;
    const applyVersion = ++this.roomConcertApplyVersion;
    this.concertState.setSong(trackTitle, Boolean(track));
    this.currentAudioImageInfo = resolveAudioImage(track?.originalName ?? trackTitle);
    this.bigScreen.setAudioImage(this.currentAudioImageInfo);

    if (!track?.url) {
      this.audioManager.stop();
      this.concertState.setPlayback(false);
      return;
    }

    try {
      await this.audioManager.loadUrl(this.roomClient.resolveMediaUrl(track.url), {
        cacheKey: trackCacheKey,
        title: trackTitle
      });
    } catch (error) {
      if (applyVersion === this.roomConcertApplyVersion) {
        this.audioManager.stop();
        this.concertState.setPlayback(false);
        this.hudView.setToast(error.message || 'Could not load room audio.');
      }
      return;
    }

    if (applyVersion !== this.roomConcertApplyVersion) {
      return;
    }

    if (!concertState.isPlaying) {
      if (concertState.status === 'paused') {
        this.audioManager.pause();
        this.audioManager.seek(concertState.playbackTime ?? 0);
      } else {
        this.audioManager.stop();
      }
      this.concertState.setPlayback(false);
      return;
    }

    try {
      const offsetSeconds = getExpectedPlaybackTime(concertState);
      await this.audioManager.play({ offsetSeconds, restart: true });
      this.concertState.setPlayback(true);
    } catch {
      this.hudView.setToast('Room state is playing, but browser audio needs a local user gesture.');
      this.concertState.setPlayback(true);
    }
  }

  async correctRoomAudioDrift() {
    const concertState = this.roomState.concertState;
    if (
      this.isCorrectingRoomDrift ||
      !this.roomState.roomId ||
      !concertState?.isPlaying ||
      !this.getSelectedRoomTrack()?.url ||
      !this.audioManager.isPlaying
    ) {
      return;
    }

    const expectedTime = getExpectedPlaybackTime(concertState);
    const currentTime = this.audioManager.getCurrentTime();
    if (Math.abs(currentTime - expectedTime) <= 0.3) {
      return;
    }

    this.isCorrectingRoomDrift = true;
    try {
      await this.audioManager.play({ offsetSeconds: expectedTime, restart: true });
    } catch {
      this.hudView.setToast('Room audio sync needs a browser playback gesture.');
    } finally {
      this.isCorrectingRoomDrift = false;
    }
  }

  handleGlobalKey(event) {
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      this.hudView.toggleHud();
      return;
    }

    if (event.code === 'F2') {
      event.preventDefault();
      const isVisible = this.collisionDebugView.toggle();
      this.hudView.setCollisionDebugVisible(isVisible);
    }
  }

  animate() {
    if (!this.isRunning) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
    const deltaTime = this.sceneManager.getDeltaTime();
    const elapsed = this.sceneManager.clock.elapsedTime;
    const shouldUpdateHud = this.hudUpdateTask.tick(deltaTime);
    const shouldUpdatePerformance = this.performanceUpdateTask.tick(deltaTime);
    const shouldCorrectRoomDrift = this.roomDriftCorrectionTask.tick(deltaTime);
    const audioMetrics = this.audioManager.getAudioMetrics(deltaTime);
    this.latestAudioMetrics = audioMetrics;
    const frequencyBinCount = this.audioManager.copyFrequencyData(this.frequencyData);
    this.audioManager.copyFrequencyBands(this.frequencyBands, this.frequencyData, frequencyBinCount);
    this.recordDiagnosticsHistory(audioMetrics);
    if (shouldUpdateHud) {
      this.concertState.setAudioMetrics(audioMetrics);
      this.diagnosticsPanel.update(
        audioMetrics,
        this.frequencyBands,
        this.diagnosticsHistory,
        this.historySnapshot,
        this.historySeries
      );
    }
    if (shouldCorrectRoomDrift) {
      this.correctRoomAudioDrift();
    }

    this.avatar.update(deltaTime, this.inputManager, this.cameraController.getYaw(), this.collisionManager);
    this.audioManager.updateListenerFromAvatar(this.avatar);
    this.audioManager.updateSpatialOcclusion(this.collisionManager);
    this.cameraController.update(deltaTime, this.avatar);
    this.avatarLookTarget.copy(this.avatar.getPosition());
    this.avatarLookTarget.y += 1.25;
    const visibility = this.avatarVisibility.update(
      this.sceneManager.camera.position,
      this.avatarLookTarget,
      deltaTime
    );
    this.avatar.setOcclusionHighlightActive(visibility.isObstructed);
    this.avatar.updateHighlight(deltaTime, elapsed);
    this.hudView.setAvatarOccluded(visibility.isObstructed);
    this.audience.update(audioMetrics, elapsed);
    this.stage.update(elapsed);
    this.lights.update(deltaTime, elapsed, audioMetrics, this.frequencyBands, {
      lightingIntensity: this.settingsManager.get('lightingIntensity')
    });
    this.speakers.update(elapsed);
    this.speakers.pulse(audioMetrics.audioScore);
    this.collisionDebugView.update();
    this.sceneManager.render();
    this.updatePerformanceDiagnostics(deltaTime, shouldUpdatePerformance);
  }

  recordDiagnosticsHistory(metrics) {
    this.diagnosticsHistory.pushSample({
      aScore: metrics.audioScore
    });
  }

  updatePerformanceDiagnostics(deltaTime, forceSample = false) {
    this.performanceSample.elapsed += Math.max(0, deltaTime);
    this.performanceSample.frames += 1;
    this.performanceSample.frameTimeTotalMs += Math.max(0, deltaTime) * 1000;

    if (!forceSample && this.performanceSample.elapsed < 0.25) {
      return;
    }

    const elapsed = this.performanceSample.elapsed || deltaTime || 1 / 60;
    const frameCount = this.performanceSample.frames || 1;
    this.performanceDiagnostics = buildPerformanceDiagnostics({
      fps: frameCount / elapsed,
      frameTimeMs: this.performanceSample.frameTimeTotalMs / frameCount,
      rendererInfo: this.sceneManager.renderer.info,
      sceneObjectCount: countSceneObjects(this.sceneManager.scene),
      collisionVolumeCount: this.collisionManager.getBoxes().length
    });
    this.performanceSample.elapsed = 0;
    this.performanceSample.frames = 0;
    this.performanceSample.frameTimeTotalMs = 0;
  }

}

function createLocalRoomState() {
  return {
    isConnected: false,
    roomId: null,
    name: 'Local',
    role: 'local',
    isHost: false,
    userCount: 1,
    playlist: [],
    concertState: {
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
      trackLabel: 'No track selected',
      imageKey: 'generated-pulse-loop'
    },
    rooms: [],
    error: null
  };
}

function getExpectedPlaybackTime(concertState) {
  const playbackTime = Math.max(0, Number(concertState?.playbackTime) || 0);
  if (!concertState?.isPlaying) {
    return playbackTime;
  }

  const serverTime = Number(concertState.serverTime);
  if (Number.isFinite(serverTime)) {
    return Math.max(0, playbackTime + Math.max(0, Date.now() - serverTime) / 1000);
  }

  const startedAt = Number(concertState.startedAt);
  if (Number.isFinite(startedAt)) {
    return Math.max(0, playbackTime + Math.max(0, Date.now() - startedAt) / 1000);
  }

  return playbackTime;
}

function getTrackCacheKey(track) {
  if (!track?.url) {
    return '';
  }

  return [
    track.id ?? 'unknown',
    track.url,
    track.uploadedAt ?? 'unknown',
    track.size ?? 0
  ].join('|');
}

function getTrackDisplayTitle(concertState, track) {
  return track?.title || concertState?.trackLabel || 'No track selected';
}

export class ConcertHudView {
  constructor(shell) {
    this.shell = shell;
    this.isHudVisible = false;
    this.trackSelectHandler = () => {};
    this.playlistRenderKey = '';
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'hud-toggle';
    this.toggleButton.type = 'button';
    this.toggleButton.innerHTML = '<span></span><span></span><span></span>';
    this.toggleButton.setAttribute('aria-controls', 'concert-hud');
    this.element = document.createElement('div');
    this.element.id = 'concert-hud';
    this.element.className = 'hud';
    this.element.innerHTML = getConcertHudMarkup();

    this.reticle = document.createElement('div');
    this.reticle.className = 'reticle';
    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.textContent = 'Load local music or join a room playlist, then start the concert.';

    this.debugIndicator = document.createElement('div');
    this.debugIndicator.className = 'debug-indicator';
    this.debugIndicator.textContent = 'Collision debug';

    this.visibilityIndicator = document.createElement('div');
    this.visibilityIndicator.className = 'visibility-indicator';
    this.visibilityIndicator.textContent = 'Avatar occluded';

    this.shell.append(
      this.toggleButton,
      this.element,
      this.reticle,
      this.toast,
      this.debugIndicator,
      this.visibilityIndicator
    );
    this.bindElements();
    this.toggleButton.addEventListener('click', () => this.toggleHud());
    this.setHudVisible(false);
  }

  bindElements() {
    this.fileButton = this.element.querySelector('[data-file-button]');
    this.fileInput = this.element.querySelector('[data-file]');
    this.startButton = this.element.querySelector('[data-start]');
    this.uploadStatusEl = this.element.querySelector('[data-upload-status]');
    this.roomLeaveButton = this.element.querySelector('[data-room-leave]');
    this.roomNameEl = this.element.querySelector('[data-room-name]');
    this.roomIdEl = this.element.querySelector('[data-room-id]');
    this.roomRoleEl = this.element.querySelector('[data-room-role]');
    this.roomCountEl = this.element.querySelector('[data-room-count]');
    this.playlistEl = this.element.querySelector('[data-playlist]');
    this.statusEl = this.element.querySelector('[data-status]');
    this.trackEl = this.element.querySelector('[data-track]');
    this.scoreEl = this.element.querySelector('[data-score]');
    this.reactionEl = this.element.querySelector('[data-reaction]');
    this.settingInputs = Array.from(this.element.querySelectorAll('[data-setting]'));
    this.settingOutputs = new Map(
      Array.from(this.element.querySelectorAll('[data-setting-value]')).map((element) => [
        element.dataset.settingValue,
        element
      ])
    );
    this.resetSettingsButton = this.element.querySelector('[data-reset-settings]');
    this.closeHudButton = this.element.querySelector('[data-close-hud]');
    this.closeHudButton.addEventListener('click', () => this.setHudVisible(false));
  }

  setToast(message) {
    this.toast.textContent = message;
  }

  setHudVisible(isVisible) {
    this.isHudVisible = Boolean(isVisible);
    this.element.classList.toggle('is-hidden', !this.isHudVisible);
    this.reticle.classList.toggle('hud-overlay-hidden', !this.isHudVisible);
    this.toast.classList.toggle('hud-overlay-hidden', !this.isHudVisible);
    this.debugIndicator.classList.toggle('hud-overlay-hidden', !this.isHudVisible);
    this.visibilityIndicator.classList.toggle('hud-overlay-hidden', !this.isHudVisible);
    this.toggleButton.classList.toggle('is-hidden', this.isHudVisible);
    this.toggleButton.setAttribute('aria-label', 'Toggle HUD');
    this.toggleButton.setAttribute('aria-expanded', String(this.isHudVisible));
  }

  toggleHud() {
    this.setHudVisible(!this.isHudVisible);
  }

  setUploadStatus(message) {
    this.uploadStatusEl.textContent = message ?? '';
  }

  setTrackSelectHandler(handler) {
    this.trackSelectHandler = typeof handler === 'function' ? handler : () => {};
  }

  updatePlaybackState(state) {
    this.statusEl.textContent = state.isPlaying ? 'Playing' : 'Stopped';
    this.trackEl.textContent = state.songTitle;
    this.scoreEl.textContent = `${Math.round(state.audioScore * 100)}%`;
    this.reactionEl.textContent =
      state.reactionLevel.charAt(0).toUpperCase() + state.reactionLevel.slice(1);
  }

  updateRoom({ roomState, playlist = [], startButtonText, uploadStatusText, isAudience }) {
    const isInRoom = Boolean(roomState.roomId);
    const concertState = roomState.concertState ?? {};
    const hasSelectedTrack = Boolean(concertState.currentTrackId);
    const isHost = Boolean(roomState.isHost);
    const canControlRoom = !isInRoom || (isHost && hasSelectedTrack);
    this.roomNameEl.textContent = isInRoom ? roomState.name ?? 'Untitled Room' : 'Local';
    this.roomIdEl.textContent = roomState.roomId ?? '-';
    this.roomRoleEl.textContent = isInRoom ? (isHost ? 'Host' : 'Audience') : 'Solo';
    this.roomCountEl.textContent = String(isInRoom ? roomState.userCount : 1);
    this.uploadStatusEl.textContent = uploadStatusText ?? '';
    this.fileInput.disabled = isInRoom && !isHost;
    this.fileButton.classList.toggle('is-disabled', this.fileInput.disabled);
    this.fileButton.setAttribute('aria-disabled', String(this.fileInput.disabled));
    this.fileInput.setAttribute(
      'aria-label',
      isInRoom ? 'Upload room playlist audio files' : 'Load local audio file'
    );
    this.roomLeaveButton.textContent = isInRoom ? 'Leave Room' : 'Back to Lobby';
    this.startButton.disabled = isAudience || !canControlRoom;
    this.startButton.textContent = startButtonText;
    this.renderPlaylist(playlist, concertState.currentTrackId, isHost);
  }

  renderPlaylist(playlist, currentTrackId, isHost) {
    const renderKey = createPlaylistRenderKey(playlist, currentTrackId, isHost);
    if (renderKey === this.playlistRenderKey) {
      return;
    }

    this.playlistRenderKey = renderKey;
    this.playlistEl.replaceChildren();

    if (!playlist.length) {
      const empty = document.createElement('p');
      empty.className = 'playlist-empty';
      empty.textContent = 'Playlist empty';
      this.playlistEl.appendChild(empty);
      return;
    }

    playlist.forEach((track, index) => {
      const item = document.createElement('button');
      item.className = 'playlist-item playlist-track';
      item.type = 'button';
      item.disabled = !isHost;
      item.classList.toggle('is-selected', track.id === currentTrackId);
      item.setAttribute('aria-pressed', String(track.id === currentTrackId));

      if (isHost) {
        item.addEventListener('click', (event) => {
          event.preventDefault();
          this.trackSelectHandler(track.id);
        });
      }

      const title = document.createElement('strong');
      title.textContent = track.originalName ?? track.title ?? `Track ${index + 1}`;
      const meta = document.createElement('span');
      meta.textContent = `${index + 1} - ${formatFileSize(track.size)}`;

      item.append(title, meta);
      this.playlistEl.appendChild(item);
    });
  }

  updateSettings(settings) {
    this.settingInputs.forEach((input) => {
      const value = settings[input.dataset.setting];
      if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else if (input.value !== String(value)) {
        input.value = String(value);
      }
    });

    this.settingOutputs.get('mouseSensitivity').textContent = `${settings.mouseSensitivity.toFixed(1)}x`;
    this.settingOutputs.get('masterVolume').textContent = `${Math.round(settings.masterVolume * 100)}%`;
    this.settingOutputs.get('audienceReactionIntensity').textContent =
      `${settings.audienceReactionIntensity.toFixed(1)}x`;
    this.settingOutputs.get('lightingIntensity').textContent = `${settings.lightingIntensity.toFixed(1)}x`;
    this.settingOutputs.get('aScoreLowThreshold').textContent = settings.aScoreLowThreshold.toFixed(2);
    this.settingOutputs.get('aScoreMediumThreshold').textContent = settings.aScoreMediumThreshold.toFixed(2);
    this.settingOutputs.get('aScoreHighThreshold').textContent = settings.aScoreHighThreshold.toFixed(2);
    this.settingOutputs.get('beatSensitivity').textContent = `${settings.beatSensitivity.toFixed(2)}x`;
  }

  setCollisionDebugVisible(isVisible) {
    this.debugIndicator.classList.toggle('is-visible', isVisible);
  }

  setAvatarOccluded(isVisible) {
    this.visibilityIndicator.classList.toggle('is-visible', isVisible);
  }
}

function createPlaylistRenderKey(playlist, currentTrackId, isHost) {
  const trackKey = playlist
    .map((track) => [
      track.id ?? '',
      track.originalName ?? '',
      track.title ?? '',
      track.size ?? 0
    ].join(':'))
    .join('|');

  return [
    isHost ? 'host' : 'audience',
    currentTrackId ?? '',
    trackKey
  ].join('::');
}

export function getConcertHudMarkup() {
  return `
      <section class="panel panel-main" aria-label="Concert controls">
        <div class="title-row">
          <h1>Virtual Concert Platform</h1>
          <span class="status-pill" data-status>Stopped</span>
        </div>
        <div class="controls-grid">
          <label class="file-picker-button" data-file-button>
            <input class="file-input" data-file type="file" multiple accept=".mp3,.wav,.ogg,.m4a,audio/*" aria-label="Load local audio file" />
            <span>Choose Audio</span>
          </label>
          <button class="primary-button" data-start type="button">Start Concert</button>
        </div>
        <div class="upload-status" data-upload-status></div>
        <section class="playlist-panel" aria-label="Room playlist">
          <div class="playlist-title">Playlist</div>
          <div class="playlist-list" data-playlist></div>
        </section>
        <div class="metrics">
          <div class="metric"><span>Track</span><strong data-track>No track selected</strong></div>
          <div class="metric"><span>A-score</span><strong data-score>0%</strong></div>
          <div class="metric"><span>Reaction</span><strong data-reaction>Low</strong></div>
        </div>
        <section class="room-panel" aria-label="Room status">
          <div class="room-meta">
            <span>Room <strong data-room-name>Local</strong></span>
            <span>Code <strong data-room-id>-</strong></span>
            <span>Role <strong data-room-role>Solo</strong></span>
            <span>Users <strong data-room-count>1</strong></span>
          </div>
          <button class="secondary-button room-leave-button" data-room-leave type="button">Back to Lobby</button>
        </section>
        <details class="diagnostics-panel">
          <summary>Audio diagnostics <span class="beat-dot" data-beat-dot></span></summary>
          <div class="diagnostic-row" data-diagnostic="rawEnergy">
            <span>Raw</span>
            <div class="diagnostic-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-diagnostic="smoothedEnergy">
            <span>Smooth</span>
            <div class="diagnostic-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-diagnostic="baselineEnergy">
            <span>Base</span>
            <div class="diagnostic-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-diagnostic="audioScore">
            <span>A-score</span>
            <div class="diagnostic-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-band="bass">
            <span>Bass</span>
            <div class="diagnostic-meter band-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-band="mids">
            <span>Mids</span>
            <div class="diagnostic-meter band-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-row" data-band="highs">
            <span>Highs</span>
            <div class="diagnostic-meter band-meter"><i></i></div>
            <output>0.00</output>
          </div>
          <div class="diagnostic-status">
            <span>Level <strong data-diagnostic-level>low</strong></span>
            <span data-diagnostic-beat>Beat idle</span>
          </div>
          <canvas class="diagnostic-history" data-history-canvas width="390" height="110" aria-label="Recent audio trend"></canvas>
        </details>
        <details class="tuning-panel">
          <summary>A-score tuning</summary>
          <div class="setting-row">
            <label for="aScoreLowThreshold">Low</label>
            <input id="aScoreLowThreshold" data-setting="aScoreLowThreshold" type="range" min="0.05" max="0.6" step="0.01" />
            <output data-setting-value="aScoreLowThreshold">0.22</output>
          </div>
          <div class="setting-row">
            <label for="aScoreMediumThreshold">Medium</label>
            <input id="aScoreMediumThreshold" data-setting="aScoreMediumThreshold" type="range" min="0.1" max="0.85" step="0.01" />
            <output data-setting-value="aScoreMediumThreshold">0.45</output>
          </div>
          <div class="setting-row">
            <label for="aScoreHighThreshold">High</label>
            <input id="aScoreHighThreshold" data-setting="aScoreHighThreshold" type="range" min="0.2" max="0.98" step="0.01" />
            <output data-setting-value="aScoreHighThreshold">0.72</output>
          </div>
          <div class="setting-row">
            <label for="beatSensitivity">Beat</label>
            <input id="beatSensitivity" data-setting="beatSensitivity" type="range" min="0.8" max="2.5" step="0.05" />
            <output data-setting-value="beatSensitivity">1.35x</output>
          </div>
        </details>
        <details class="settings-panel">
          <summary>Settings</summary>
          <div class="setting-row">
            <label for="mouseSensitivity">Mouse</label>
            <input id="mouseSensitivity" data-setting="mouseSensitivity" type="range" min="0.2" max="3" step="0.1" />
            <output data-setting-value="mouseSensitivity">1.0x</output>
          </div>
          <div class="setting-row">
            <label for="masterVolume">Volume</label>
            <input id="masterVolume" data-setting="masterVolume" type="range" min="0" max="1" step="0.05" />
            <output data-setting-value="masterVolume">80%</output>
          </div>
          <div class="setting-row">
            <label for="audienceReactionIntensity">Audience</label>
            <input id="audienceReactionIntensity" data-setting="audienceReactionIntensity" type="range" min="0" max="2" step="0.1" />
            <output data-setting-value="audienceReactionIntensity">1.0x</output>
          </div>
          <div class="setting-row">
            <label for="lightingIntensity">Lights</label>
            <input id="lightingIntensity" data-setting="lightingIntensity" type="range" min="0" max="2" step="0.1" />
            <output data-setting-value="lightingIntensity">1.0x</output>
          </div>
        </details>
        <button class="secondary-button settings-reset" data-reset-settings type="button">Reset Settings</button>
        <button class="secondary-button hud-close-button" data-close-hud type="button">Close HUD</button>
      </section>
      <section class="panel help" aria-label="Controls">
        <kbd>ALT</kbd> mouse capture / <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move / <kbd>SHIFT</kbd> sprint / <kbd>SPACE</kbd> jump / <kbd>wheel</kbd> zoom / <kbd>F2</kbd> collision debug
      </section>
    `;
}

function formatFileSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

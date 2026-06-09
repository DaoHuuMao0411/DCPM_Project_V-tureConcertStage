import * as THREE from 'three';

const DEFAULT_METRICS = {
  audioScore: 0,
  isBeat: false
};

const DEFAULT_BANDS = {
  bass: 0,
  mids: 0,
  highs: 0
};

export class LightSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LightSystem';
    this.beams = [];
    this.spots = [];
    this.accentLights = [];
    this.floorPulses = [];
    this.beatFlash = 0;
    this.lastBeat = false;
    this.build();
  }

  build() {
    this.ambient = new THREE.HemisphereLight(0x93c5fd, 0x111827, 0.5);
    this.group.add(this.ambient);

    this.key = new THREE.DirectionalLight(0xffffff, 1.05);
    this.key.position.set(10, 16, 10);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 70;
    this.key.shadow.camera.left = -25;
    this.key.shadow.camera.right = 25;
    this.key.shadow.camera.top = 25;
    this.key.shadow.camera.bottom = -25;
    this.group.add(this.key);

    const spotConfigs = [
      { x: -5.4, color: 0xf97316 },
      { x: 1.8, color: 0xef4444 },
      { x: 5.4, color: 0xfacc15 },
      { x: 9.2, color: 0xa78bfa }
    ];
    spotConfigs.forEach(({ x, color }, index) => {
      const spot = new THREE.SpotLight(color, 1.8, 48, Math.PI / 8, 0.5, 1.1);
      spot.position.set(x, 8.4, -19.6);
      spot.target.position.set(x * 0.18, 0.65, -8.5);
      spot.castShadow = index % 2 === 0;
      this.group.add(spot, spot.target);
      this.spots.push(spot);

      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 8, 28, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      beam.position.set(x * 0.52, 4.35, -13.9);
      beam.rotation.x = -0.42;
      beam.renderOrder = 2;
      this.group.add(beam);
      this.beams.push(beam);
    });

    [
      [-10.4, 3.2, -14.8, 0xf97316],
      [-6.8, 1.1, -8.6, 0xfacc15],
      [6.8, 1.1, -8.6, 0xfb7185]
    ].forEach(([x, y, z, color]) => {
      const light = new THREE.PointLight(color, 0.6, 18, 1.7);
      light.position.set(x, y, z);
      this.group.add(light);
      this.accentLights.push(light);
    });

    [-4.2, 4.2].forEach((x) => {
      const pulse = new THREE.Mesh(
        new THREE.CircleGeometry(2.2, 36),
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.04,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      pulse.position.set(x, 0.026, -9.8);
      pulse.rotation.x = -Math.PI / 2;
      pulse.renderOrder = 1;
      this.group.add(pulse);
      this.floorPulses.push(pulse);
    });
  }

  update(deltaTimeOrScore, timeOrElapsed = 0, metricsOrBands, bandsOrSettings = DEFAULT_BANDS, settings = {}) {
    const legacyCall = typeof metricsOrBands === 'undefined' || typeof metricsOrBands === 'number';
    const deltaTime = legacyCall ? 1 / 60 : deltaTimeOrScore;
    const time = legacyCall ? timeOrElapsed : timeOrElapsed;
    const metrics = legacyCall
      ? { audioScore: deltaTimeOrScore, isBeat: false }
      : normalizeLightingMetrics(metricsOrBands);
    const bands = legacyCall ? DEFAULT_BANDS : normalizeLightingBands(bandsOrSettings);
    const intensity = normalizeLightingIntensity(settings?.lightingIntensity);

    if (metrics.isBeat && !this.lastBeat && intensity > 0) {
      this.beatFlash = Math.min(1, this.beatFlash + 0.85);
    }
    this.lastBeat = metrics.isBeat;
    this.beatFlash = Math.max(0, this.beatFlash - Math.max(0, deltaTime) * 2.8);

    const state = computeLightingState(metrics, bands, intensity, this.beatFlash);
    this.applyLightingState(state, time, bands, intensity);
  }

  applyLightingState(state, time, bands, intensity) {
    this.ambient.intensity = state.ambientIntensity;
    this.ambient.color.setHSL(0.58 - bands.bass * 0.08 + bands.highs * 0.05, 0.48, 0.66);
    this.key.intensity = state.keyIntensity;

    this.spots.forEach((spot, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const sweep = Math.sin(time * state.motionRate + index * 0.72);
      const crossSweep = Math.cos(time * (state.motionRate * 0.64) + index);
      spot.intensity = state.spotIntensity + sweep * state.motionAmount * 0.35;
      spot.angle = Math.PI / (8.5 - state.highSharpness);
      spot.target.position.set(
        side * (2.2 + bands.mids * 5.2) * sweep,
        0.55 + bands.highs * 0.45,
        -8.7 + crossSweep * (1.2 + bands.mids * 2.6)
      );
    });

    this.beams.forEach((beam, index) => {
      const shimmer = 0.5 + Math.sin(time * (2.2 + bands.highs * 3.5) + index * 0.8) * 0.5;
      beam.material.opacity = state.beamOpacity * (0.78 + shimmer * 0.22);
      beam.rotation.z = Math.sin(time * state.motionRate + index) * (0.12 + bands.mids * 0.2);
      beam.scale.setScalar(1 + bands.bass * 0.18 + this.beatFlash * 0.18);
    });

    this.accentLights.forEach((light, index) => {
      const warm = index % 2 === 0;
      const bandValue = warm ? bands.bass : bands.highs;
      light.intensity = state.accentIntensity * (0.75 + bandValue * 0.8);
      light.distance = 12 + intensity * 4 + bandValue * 8;
    });

    this.floorPulses.forEach((pulse, index) => {
      const wave = 0.5 + Math.sin(time * 3.2 + index * 1.3) * 0.5;
      pulse.material.opacity = state.floorOpacity * (0.7 + wave * 0.3);
      pulse.scale.setScalar(0.9 + bands.bass * 0.5 + this.beatFlash * 0.28);
    });
  }

}

export function computeLightingState(metrics = DEFAULT_METRICS, bands = DEFAULT_BANDS, intensity = 1, beatFlash = 0) {
  const normalizedMetrics = normalizeLightingMetrics(metrics);
  const normalizedBands = normalizeLightingBands(bands);
  const safeIntensity = normalizeLightingIntensity(intensity);
  const score = normalizedMetrics.audioScore;
  const flash = clamp01(beatFlash);
  const reactiveScale = safeIntensity;

  return {
    ambientIntensity: 0.35 + reactiveScale * (0.1 + score * 0.18 + normalizedBands.highs * 0.06),
    keyIntensity: 0.7 + reactiveScale * (0.25 + score * 0.5 + flash * 0.35),
    spotIntensity: 0.25 + reactiveScale * (0.85 + score * 2.35 + normalizedBands.mids * 1.15 + flash * 1.25),
    accentIntensity: 0.12 + reactiveScale * (0.35 + normalizedBands.bass * 1.3 + normalizedBands.highs * 0.75 + flash * 1.15),
    beamOpacity: Math.min(0.34, reactiveScale * (0.035 + score * 0.1 + normalizedBands.mids * 0.08 + flash * 0.08)),
    floorOpacity: Math.min(0.28, reactiveScale * (0.025 + normalizedBands.bass * 0.14 + flash * 0.08)),
    motionRate: 0.45 + score * 1.45 + normalizedBands.mids * 1.25,
    motionAmount: reactiveScale * (0.35 + score * 0.9 + normalizedBands.mids * 0.8),
    highSharpness: normalizedBands.highs * 1.15
  };
}

export function normalizeLightingMetrics(metrics = DEFAULT_METRICS) {
  return {
    audioScore: clamp01(metrics?.audioScore),
    isBeat: Boolean(metrics?.isBeat)
  };
}

export function normalizeLightingBands(bands = DEFAULT_BANDS) {
  return {
    bass: clamp01(bands?.bass),
    mids: clamp01(bands?.mids),
    highs: clamp01(bands?.highs)
  };
}

export function normalizeLightingIntensity(value = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }

  return Math.min(2, Math.max(0, number));
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

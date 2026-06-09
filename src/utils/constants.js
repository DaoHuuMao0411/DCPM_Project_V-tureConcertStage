export const RUNWAY_HEIGHT = 0.36;
export const AVATAR_HEIGHT = 2.29;
export const AUDIENCE_MEMBER_HEIGHT = AVATAR_HEIGHT;

// Reference frame contract: +Y is up, the ground is the XZ plane, +Z points
// toward the audience/rear hall, and -Z points toward the stage/back wall.
export const PLAYER = {
  id: 'VIP-001',
  radius: 0.48,
  visualHeight: AVATAR_HEIGHT,
  // Tuned for responsive venue navigation without instant starts or runaway sprinting.
  moveSpeed: 7,
  sprintSpeed: 9.8,
  acceleration: 46,
  airAcceleration: 16,
  deceleration: 38,
  // Jump assist windows stay subtle so they forgive timing without feeling like air jumps.
  jumpVelocity: 8.6,
  coyoteTimeSeconds: 0.09,
  jumpBufferSeconds: 0.1,
  gravity: 25.5,
  // Automatic step-up is intentionally capped at the runway height.
  maxStepUpHeight: RUNWAY_HEIGHT,
  groundY: 0
};

export const CAMERA = {
  followDistance: 7.5,
  minFollowDistance: 3.5,
  maxFollowDistance: 13,
  // Wheel delta is pixel-based in most desktop browsers; 100px maps to about 1 unit of zoom.
  zoomSensitivity: 0.01,
  height: 3.2,
  minPitch: -1.05,
  maxPitch: 0.85,
  sensitivity: 0.0022,
  followPositionRate: 16
};

export const AUDIO_THRESHOLDS = {
  medium: 0.18,
  high: 0.38
};

export const AUDIO_REACTIVITY = {
  initialBaseline: 0.06,
  smoothing: {
    attackRate: 10,
    releaseRate: 4
  },
  baseline: {
    riseRate: 0.55,
    fallRate: 1.15,
    min: 0.035,
    max: 0.62
  },
  beat: {
    minEnergy: 0.14,
    minSpike: 0.055,
    sensitivity: 1.32,
    cooldown: 0.24,
    boost: 0.18,
    boostDecayRate: 3.2
  },
  score: {
    noiseFloor: 0.045,
    energyCeiling: 0.62,
    energyWeight: 0.76,
    relativeWeight: 0.24,
    relativeGain: 2.4
  },
  levels: {
    lowToMedium: 0.24,
    mediumToLow: 0.17,
    mediumToHigh: 0.56,
    highToMedium: 0.43,
    minHoldTime: 0.38
  }
};

export const AUDIENCE = {
  rows: 7,
  perRow: 13,
  rowSpacing: 1.35,
  rowDepth: 1.04,
  rowHeightStep: 0.34,
  seatSpacing: 1.02,
  startZ: -2.8,
  startY: 0.46,
  aisleWidth: 2.5,
  seatingColumns: [
    { id: 'left', seats: 4, width: 5.2, centerX: -7.9 },
    { id: 'center', seats: 5, width: 5.6, centerX: 0 },
    { id: 'right', seats: 4, width: 5.2, centerX: 7.9 }
  ],
  aisles: [
    { id: 'left-center', width: 2.5, centerX: -4.05 },
    { id: 'center-right', width: 2.5, centerX: 4.05 }
  ]
};

export const WORLD = {
  floorSize: 74,
  stageWidth: 22,
  stageDepth: 11,
  stageHeight: 1.05,
  runwayHeight: RUNWAY_HEIGHT
};

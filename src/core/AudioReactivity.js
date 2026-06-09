import { AUDIO_REACTIVITY } from '../utils/constants.js';
import { clamp, normalizedAverage } from '../utils/math.js';

export class AudioReactivity {
  constructor(config = AUDIO_REACTIVITY) {
    this.config = structuredClone(config);
    this.rawEnergy = 0;
    this.smoothedEnergy = 0;
    this.baselineEnergy = config.initialBaseline;
    this.audioScore = 0;
    this.reactionLevel = 'low';
    this.isBeat = false;
    this.beatCooldownRemaining = 0;
    this.levelHoldRemaining = 0;
    this.beatBoost = 0;
  }

  setTuning(tuning) {
    if (!tuning) {
      return;
    }

    const lowThreshold = clamp(tuning.aScoreLowThreshold ?? this.config.levels.mediumToLow, 0.05, 0.6);
    const mediumThreshold = clamp(
      tuning.aScoreMediumThreshold ?? this.config.levels.lowToMedium,
      lowThreshold + 0.03,
      0.85
    );
    const highThreshold = clamp(
      tuning.aScoreHighThreshold ?? this.config.levels.mediumToHigh,
      mediumThreshold + 0.03,
      0.98
    );

    this.config.levels.mediumToLow = lowThreshold;
    this.config.levels.lowToMedium = mediumThreshold;
    this.config.levels.highToMedium = mediumThreshold;
    this.config.levels.mediumToHigh = highThreshold;
    this.config.beat.sensitivity = clamp(tuning.beatSensitivity ?? this.config.beat.sensitivity, 0.8, 2.5);
  }

  updateFromFrequencyData(frequencyData, deltaTime) {
    const rawEnergy = calculateRawEnergy(frequencyData);
    return this.updateFromEnergy(rawEnergy, deltaTime);
  }

  updateFromEnergy(rawEnergy, deltaTime) {
    const dt = Math.max(deltaTime, 1 / 120);
    this.rawEnergy = clamp(rawEnergy, 0, 1);

    const smoothRate =
      this.rawEnergy > this.smoothedEnergy
        ? this.config.smoothing.attackRate
        : this.config.smoothing.releaseRate;
    const smoothAlpha = 1 - Math.exp(-smoothRate * dt);
    this.smoothedEnergy += (this.rawEnergy - this.smoothedEnergy) * smoothAlpha;

    const baselineRate =
      this.rawEnergy > this.baselineEnergy
        ? this.config.baseline.riseRate
        : this.config.baseline.fallRate;
    const baselineAlpha = 1 - Math.exp(-baselineRate * dt);
    this.baselineEnergy += (this.rawEnergy - this.baselineEnergy) * baselineAlpha;
    this.baselineEnergy = clamp(
      this.baselineEnergy,
      this.config.baseline.min,
      this.config.baseline.max
    );

    this.beatCooldownRemaining = Math.max(0, this.beatCooldownRemaining - dt);
    this.beatBoost = Math.max(0, this.beatBoost - dt * this.config.beat.boostDecayRate);
    const spike = this.rawEnergy - this.baselineEnergy;
    this.isBeat =
      this.beatCooldownRemaining === 0 &&
      this.rawEnergy >= this.config.beat.minEnergy &&
      spike >= this.config.beat.minSpike &&
      this.rawEnergy >= this.baselineEnergy * this.config.beat.sensitivity;

    if (this.isBeat) {
      this.beatCooldownRemaining = this.config.beat.cooldown;
      this.beatBoost = this.config.beat.boost;
    }

    const normalizedEnergy = clamp(
      (this.smoothedEnergy - this.config.score.noiseFloor) /
        (this.config.score.energyCeiling - this.config.score.noiseFloor),
      0,
      1
    );
    const relativeLift = clamp(
      (this.smoothedEnergy - this.baselineEnergy) * this.config.score.relativeGain,
      0,
      1
    );

    this.audioScore = clamp(
      normalizedEnergy * this.config.score.energyWeight +
        relativeLift * this.config.score.relativeWeight +
        this.beatBoost,
      0,
      1
    );

    this.updateLevel(dt);
    return this.getMetrics();
  }

  updateSilence(deltaTime) {
    return this.updateFromEnergy(0, deltaTime);
  }

  getMetrics() {
    return {
      rawEnergy: this.rawEnergy,
      smoothedEnergy: this.smoothedEnergy,
      baselineEnergy: this.baselineEnergy,
      audioScore: this.audioScore,
      reactionLevel: this.reactionLevel,
      isBeat: this.isBeat
    };
  }

  updateLevel(deltaTime) {
    this.levelHoldRemaining = Math.max(0, this.levelHoldRemaining - deltaTime);
    const thresholds = this.config.levels;
    let nextLevel = this.reactionLevel;

    if (this.reactionLevel === 'low' && this.audioScore >= thresholds.lowToMedium) {
      nextLevel = 'medium';
    } else if (this.reactionLevel === 'medium') {
      if (this.audioScore >= thresholds.mediumToHigh) {
        nextLevel = 'high';
      } else if (this.audioScore <= thresholds.mediumToLow) {
        nextLevel = 'low';
      }
    } else if (this.reactionLevel === 'high' && this.audioScore <= thresholds.highToMedium) {
      nextLevel = 'medium';
    }

    if (nextLevel !== this.reactionLevel && this.levelHoldRemaining === 0) {
      this.reactionLevel = nextLevel;
      this.levelHoldRemaining = thresholds.minHoldTime;
    }
  }
}

export function calculateRawEnergy(frequencyData) {
  if (!frequencyData || frequencyData.length === 0) {
    return 0;
  }

  const bassBinCount = Math.max(4, Math.floor(frequencyData.length * 0.22));
  const bassSlice =
    typeof frequencyData.subarray === 'function'
      ? frequencyData.subarray(0, bassBinCount)
      : frequencyData.slice(0, bassBinCount);
  const bassEnergy = normalizedAverage(bassSlice);
  const fullEnergy = normalizedAverage(frequencyData);
  return clamp(fullEnergy * 0.4 + bassEnergy * 0.6, 0, 1);
}

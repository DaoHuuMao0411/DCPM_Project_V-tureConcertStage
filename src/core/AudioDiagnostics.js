export function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function formatMetric(value) {
  return clamp01(value).toFixed(2);
}

export function normalizeDiagnostics(metrics = {}) {
  return {
    rawEnergy: clamp01(metrics.rawEnergy),
    smoothedEnergy: clamp01(metrics.smoothedEnergy),
    baselineEnergy: clamp01(metrics.baselineEnergy),
    audioScore: clamp01(metrics.audioScore),
    reactionLevel: metrics.reactionLevel || 'low',
    isBeat: Boolean(metrics.isBeat)
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

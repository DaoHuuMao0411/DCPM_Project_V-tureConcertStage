export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function normalizedAverage(values) {
  if (!values || values.length === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }

  return clamp(total / values.length / 255, 0, 1);
}

export function pickReactionLevel(score, thresholds) {
  if (score >= thresholds.high) {
    return 'high';
  }

  if (score >= thresholds.medium) {
    return 'medium';
  }

  return 'low';
}

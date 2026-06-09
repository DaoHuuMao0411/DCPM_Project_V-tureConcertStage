export const DEFAULT_HISTORY_CAPACITY = 180;

export class DiagnosticsHistory {
  constructor(capacity = DEFAULT_HISTORY_CAPACITY) {
    this.capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_HISTORY_CAPACITY));
    this.index = 0;
    this.count = 0;
    this.aScore = new Float32Array(this.capacity);
  }

  pushSample(sample = {}) {
    this.aScore[this.index] = clamp01(sample.aScore);

    this.index = (this.index + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  copySeries(key, targetArray) {
    if (!targetArray || typeof targetArray.length !== 'number') {
      return 0;
    }

    targetArray.fill(0);
    if (key !== 'aScore') {
      return 0;
    }

    const copyCount = Math.min(this.count, targetArray.length);
    const start = this.getStartIndex();
    for (let i = 0; i < copyCount; i += 1) {
      targetArray[i] = this.aScore[(start + i) % this.capacity];
    }

    return copyCount;
  }

  getStartIndex() {
    return this.count < this.capacity ? 0 : this.index;
  }
}

export function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

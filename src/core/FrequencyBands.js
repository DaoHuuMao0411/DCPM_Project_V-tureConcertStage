export const EMPTY_FREQUENCY_BANDS = {
  bass: 0,
  mids: 0,
  highs: 0
};

export function calculateFrequencyBands(frequencyData, target = {}, count = frequencyData?.length ?? 0) {
  target.bass = 0;
  target.mids = 0;
  target.highs = 0;

  const length = Math.max(0, Math.min(Number(count) || 0, frequencyData?.length ?? 0));
  if (!frequencyData || length <= 0) {
    return target;
  }

  const bassEnd = Math.max(1, Math.floor(length * 0.28));
  const midsEnd = Math.max(bassEnd + 1, Math.floor(length * 0.68));

  target.bass = averageRange(frequencyData, 0, Math.min(bassEnd, length));
  target.mids = averageRange(frequencyData, Math.min(bassEnd, length), Math.min(midsEnd, length));
  target.highs = averageRange(frequencyData, Math.min(midsEnd, length), length);

  return target;
}

export function normalizeFrequencyByte(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number / 255));
}

function averageRange(data, start, end) {
  if (end <= start) {
    return 0;
  }

  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += normalizeFrequencyByte(data[index]);
  }

  return total / (end - start);
}

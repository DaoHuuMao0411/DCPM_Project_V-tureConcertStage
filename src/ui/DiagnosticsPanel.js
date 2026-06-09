import { formatMetric, normalizeDiagnostics, toPercent } from '../core/AudioDiagnostics.js';

export class DiagnosticsPanel {
  constructor(hudRoot) {
    this.diagnosticRows = new Map(
      Array.from(hudRoot.querySelectorAll('[data-diagnostic]')).map((row) => [
        row.dataset.diagnostic,
        {
          meter: row.querySelector('i'),
          value: row.querySelector('output')
        }
      ])
    );
    this.bandRows = new Map(
      Array.from(hudRoot.querySelectorAll('[data-band]')).map((row) => [
        row.dataset.band,
        {
          meter: row.querySelector('i'),
          value: row.querySelector('output')
        }
      ])
    );
    this.diagnosticLevelEl = hudRoot.querySelector('[data-diagnostic-level]');
    this.diagnosticBeatEl = hudRoot.querySelector('[data-diagnostic-beat]');
    this.beatDotEl = hudRoot.querySelector('[data-beat-dot]');
    this.historyCanvas = hudRoot.querySelector('[data-history-canvas]');
    this.historyContext = this.historyCanvas.getContext('2d');
  }

  update(metrics, frequencyBands, diagnosticsHistory, historySnapshot, historySeries) {
    this.syncHistorySnapshot(diagnosticsHistory, historySnapshot, historySeries);
    const diagnostics = normalizeDiagnostics(metrics);

    ['rawEnergy', 'smoothedEnergy', 'baselineEnergy', 'audioScore'].forEach((key) => {
      const row = this.diagnosticRows.get(key);
      row.meter.style.width = toPercent(diagnostics[key]);
      row.value.textContent = formatMetric(diagnostics[key]);
    });

    ['bass', 'mids', 'highs'].forEach((key) => {
      const row = this.bandRows.get(key);
      const value = frequencyBands?.[key] ?? 0;
      row.meter.style.width = toPercent(value);
      row.value.textContent = formatMetric(value);
    });

    this.diagnosticLevelEl.textContent = diagnostics.reactionLevel;
    this.diagnosticBeatEl.textContent = diagnostics.isBeat ? 'Beat hit' : 'Beat idle';
    this.beatDotEl.classList.toggle('is-beat', diagnostics.isBeat);
    this.drawHistoryCanvas(historySnapshot);
  }

  syncHistorySnapshot(diagnosticsHistory, historySnapshot, historySeries) {
    historySnapshot.count = diagnosticsHistory.copySeries('aScore', historySeries.aScore);
  }

  drawHistoryCanvas(history) {
    const ctx = this.historyContext;
    const width = this.historyCanvas.width;
    const height = this.historyCanvas.height;
    const count = history.count;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.stroke();

    drawTrendLine(ctx, history.aScore, count, width, height, '#e24d38', 2);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Trend  A-score', 8, 14);
  }
}

function drawTrendLine(ctx, series, count, width, height, color, lineWidth) {
  if (!count) {
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  for (let i = 0; i < count; i += 1) {
    const x = count === 1 ? width : (i / (count - 1)) * width;
    const y = height - clamp01(series[i]) * (height - 18) - 4;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(1, Math.max(0, number));
}

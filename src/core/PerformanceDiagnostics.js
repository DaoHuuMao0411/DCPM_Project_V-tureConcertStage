export const DEFAULT_PERFORMANCE_INTERVAL_SECONDS = 0.25;

export class ThrottledTask {
  constructor(intervalSeconds = DEFAULT_PERFORMANCE_INTERVAL_SECONDS) {
    this.intervalSeconds = Math.max(0.001, Number(intervalSeconds) || DEFAULT_PERFORMANCE_INTERVAL_SECONDS);
    this.elapsedSeconds = this.intervalSeconds;
  }

  tick(deltaTimeSeconds) {
    this.elapsedSeconds += Math.max(0, Number(deltaTimeSeconds) || 0);
    if (this.elapsedSeconds < this.intervalSeconds) {
      return false;
    }

    this.elapsedSeconds = 0;
    return true;
  }
}

export function getCappedPixelRatio(windowRef = globalThis.window, maxPixelRatio = 1.5) {
  const devicePixelRatio = Number(windowRef?.devicePixelRatio);
  const safeRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(Math.max(1, safeRatio), Math.max(1, Number(maxPixelRatio) || 1.5));
}

export function countSceneObjects(root) {
  let count = 0;
  root?.traverse?.(() => {
    count += 1;
  });
  return count;
}

export function buildPerformanceDiagnostics(input = {}) {
  const {
    fps = 0,
    frameTimeMs = 0,
    rendererInfo = {},
    sceneObjectCount = input.sceneObjects ?? 0,
    collisionVolumeCount = input.collisionVolumes ?? 0
  } = input;
  const render = rendererInfo.render ?? {};
  const memory = rendererInfo.memory ?? {};

  return {
    fps: roundNumber(fps, 1),
    frameTimeMs: roundNumber(frameTimeMs, 1),
    drawCalls: safeInteger(render.calls ?? input.drawCalls),
    triangles: safeInteger(render.triangles ?? input.triangles),
    geometries: safeInteger(memory.geometries ?? input.geometries),
    textures: safeInteger(memory.textures ?? input.textures),
    sceneObjects: safeInteger(sceneObjectCount),
    collisionVolumes: safeInteger(collisionVolumeCount)
  };
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.round(number);
}

function roundNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

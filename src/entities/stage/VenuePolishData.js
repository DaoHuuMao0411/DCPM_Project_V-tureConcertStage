export function createFloorDecalData() {
  return [
    { id: 'vip-boundary', x: 0, z: -4.35, width: 19.5, depth: 0.08, color: 'warning' },
    { id: 'speaker-safe-left', x: -9.4, z: -13.1, width: 3.1, depth: 0.08, color: 'warning' },
    { id: 'speaker-safe-right', x: 9.4, z: -13.1, width: 3.1, depth: 0.08, color: 'warning' },
    { id: 'audience-zone-left', x: -7.1, z: -3.15, width: 0.08, depth: 8.4, color: 'muted' },
    { id: 'audience-zone-right', x: 7.1, z: -3.15, width: 0.08, depth: 8.4, color: 'muted' }
  ].map((decal) => normalizeDecal(decal));
}

export function createCeilingRiggingData() {
  return {
    crossBeams: [-24, -20, -16, -12].map((z) => ({
      x: 0,
      y: 10.2,
      z,
      width: 25.5,
      height: 0.12,
      depth: 0.12
    })),
    sideBeams: [-11.8, 11.8].map((x) => ({
      x,
      y: 10.08,
      z: -18,
      width: 0.12,
      height: 0.12,
      depth: 13.8
    })),
    cables: [-9, -4.5, 0, 4.5, 9].flatMap((x) => [
      { x, y: 9.15, z: -21.9, radius: 0.025, height: 1.65 },
      { x, y: 9.15, z: -14.2, radius: 0.025, height: 1.65 }
    ])
  };
}

function normalizeDecal(decal) {
  return {
    ...decal,
    x: Number.isFinite(Number(decal.x)) ? Number(decal.x) : 0,
    z: Number.isFinite(Number(decal.z)) ? Number(decal.z) : 0,
    width: Math.max(0.04, Number(decal.width) || 0.04),
    depth: Math.max(0.04, Number(decal.depth) || 0.04),
    rotation: Number.isFinite(Number(decal.rotation)) ? Number(decal.rotation) : 0
  };
}

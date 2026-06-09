import { AUDIENCE } from './constants.js';

export function getStandColumns(config = AUDIENCE) {
  return (config.seatingColumns ?? []).map((column) => ({
    id: column.id,
    seats: Math.max(1, Math.floor(Number(column.seats) || 1)),
    width: Math.max(0.1, Number(column.width) || 0.1),
    centerX: Number.isFinite(Number(column.centerX)) ? Number(column.centerX) : 0
  }));
}

export function getStandAisles(config = AUDIENCE) {
  return (config.aisles ?? []).map((aisle) => ({
    id: aisle.id,
    width: Math.max(0.1, Number(aisle.width) || config.aisleWidth || 0.1),
    centerX: Number.isFinite(Number(aisle.centerX)) ? Number(aisle.centerX) : 0
  }));
}

export function getStandSeatingBlockBounds(config = AUDIENCE) {
  const bounds = getStandBounds(config);

  return getStandColumns(config).map((column) => ({
    id: column.id,
    centerX: column.centerX,
    centerZ: bounds.centerZ,
    minX: column.centerX - column.width / 2,
    maxX: column.centerX + column.width / 2,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    width: column.width,
    depth: bounds.depth
  }));
}

export function getStandAisleBounds(config = AUDIENCE) {
  const bounds = getStandBounds(config);

  return getStandAisles(config).map((aisle) => ({
    id: aisle.id,
    centerX: aisle.centerX,
    centerZ: bounds.centerZ,
    minX: aisle.centerX - aisle.width / 2,
    maxX: aisle.centerX + aisle.width / 2,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    width: aisle.width,
    depth: bounds.depth
  }));
}

export function getStandAisleStairs(config = AUDIENCE) {
  const rows = getStandRows(config);
  const aisles = getStandAisleBounds(config);
  const stepCount = Math.max(1, rows.length);
  const bounds = getStandBounds(config);
  const stepDepth = bounds.depth / stepCount;
  const stepHeight = Math.max(0.01, Number(config.stairStepHeight) || Number(config.rowHeightStep) || 0.01);

  return aisles.flatMap((aisle) =>
    Array.from({ length: stepCount }, (_, index) => {
      const minZ = bounds.minZ + stepDepth * index;
      const maxZ = index === stepCount - 1 ? bounds.maxZ : minZ + stepDepth;
      return {
        id: `${aisle.id}-${index + 1}`,
        aisleId: aisle.id,
        index,
        centerX: aisle.centerX,
        minX: aisle.minX,
        maxX: aisle.maxX,
        width: aisle.width,
        minZ,
        maxZ,
        centerZ: (minZ + maxZ) / 2,
        depth: maxZ - minZ,
        topY: stepHeight * (index + 1),
        stepHeight
      };
    })
  );
}

export function getStandAisleRamps(config = AUDIENCE) {
  const stairs = getStandAisleStairs(config);
  const aisles = getStandAisleBounds(config);

  return aisles.map((aisle) => {
    const aisleSteps = stairs
      .filter((step) => step.aisleId === aisle.id)
      .sort((a, b) => a.index - b.index);
    const topY = aisleSteps[aisleSteps.length - 1]?.topY ?? 0;
    const safeRampEnd = aisle.maxZ - 0.24;

    return {
      id: `${aisle.id}-walkable-ramp`,
      aisleId: aisle.id,
      centerX: aisle.centerX,
      centerZ: aisle.centerZ,
      minX: aisle.minX,
      maxX: aisle.maxX,
      minZ: aisle.minZ,
      maxZ: aisle.maxZ,
      width: aisle.width,
      depth: aisle.depth,
      rampAxis: 'z',
      rampStart: aisle.minZ,
      rampEnd: safeRampEnd,
      rampStartY: 0,
      rampEndY: topY,
      topY
    };
  });
}

export function getStandRows(config = AUDIENCE) {
  const rowCount = Math.max(1, Math.floor(Number(config.rows) || 1));
  const startY = finiteOr(config.startY, 0);
  const startZ = finiteOr(config.startZ, 0);
  const rowSpacing = Math.max(0.1, Number(config.rowSpacing) || 0.1);
  const rowHeightStep = Math.max(0, Number(config.rowHeightStep) || 0);

  return Array.from({ length: rowCount }, (_, row) => ({
    row,
    y: startY + row * rowHeightStep,
    z: startZ + row * rowSpacing
  }));
}

export function getStandBounds(config = AUDIENCE) {
  const columns = getStandColumns(config);
  const rows = getStandRows(config);
  const rowDepth = Math.max(0.1, Number(config.rowDepth) || Number(config.rowSpacing) || 1);
  const minX = Math.min(...columns.map((column) => column.centerX - column.width / 2));
  const maxX = Math.max(...columns.map((column) => column.centerX + column.width / 2));
  const minZ = Math.min(...rows.map((row) => row.z - rowDepth / 2));
  const maxZ = Math.max(...rows.map((row) => row.z + rowDepth / 2));

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
    rowDepth
  };
}

export function createAudienceSeatPlacements(config = AUDIENCE) {
  const rows = getStandRows(config);
  const columns = getStandColumns(config);
  const rowDepth = Math.max(0.1, Number(config.rowDepth) || Number(config.rowSpacing) || 1);
  let globalSeatIndex = 0;

  return rows.flatMap((row) =>
    columns.flatMap((column) => {
      const spacing = column.width / (column.seats + 1);

      return Array.from({ length: column.seats }, (_, seat) => {
        const x = column.centerX - column.width / 2 + spacing * (seat + 1);
        const placement = {
          row: row.row,
          seat,
          globalSeatIndex,
          columnId: column.id,
          x,
          y: row.y + 0.32,
          z: row.z + rowDepth * 0.08
        };
        globalSeatIndex += 1;
        return placement;
      });
    })
  );
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

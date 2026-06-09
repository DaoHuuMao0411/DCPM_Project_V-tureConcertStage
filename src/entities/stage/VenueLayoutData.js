import { WORLD } from '../../utils/constants.js';

export const STAGE_LAYOUT = {
  deck: {
    centerX: 0,
    centerZ: -18,
    collisionPadding: { width: 0.8, height: 0.3, depth: 0.8 }
  },
  runway: {
    centerX: 0,
    centerZ: -9.2,
    width: 4.4,
    depth: 12,
    collisionWidth: 5.1,
    collisionHeightExtra: 0.19,
    collisionDepth: 12.4,
    minJumpY: 0.24
  },
  backWall: {
    centerX: 0,
    centerY: 4.7,
    centerZ: -23.7,
    visualWidthExtra: 2,
    visualHeight: 7.5,
    visualDepth: 0.45,
    collisionWidthExtra: 2.5,
    collisionHeight: 7.8,
    collisionDepth: 0.9
  },
  wings: {
    centerAbsX: 12.9,
    centerY: 0.41,
    centerZ: -17.2,
    width: 3.2,
    height: 1,
    depth: 7.8,
    collisionWidth: 3.4,
    collisionHeight: 1.05,
    collisionDepth: 8.1,
    minJumpY: 0.5
  },
  truss: {
    postAbsX: 11.4,
    postY: 4.7,
    postZ: -18.4,
    postHeight: 9
  }
};

export const STAGE_SIDE_STAIR_DEPTH = 2.4;
export const STAGE_SIDE_STAIR = {
  startX: 14.22,
  endX: 11.02,
  centerZ: -22.3,
  stepCount: 4,
  blockWidth: 0.72,
  blockStartX: 13.86,
  blockStepX: 0.83,
  edgeWidth: 0.62,
  edgeDepthScale: 0.9
};

export const AUDIENCE_BARRIER_LAYOUT = {
  frontOffsetZ: -0.42,
  frontYAboveFirstRow: 0.72,
  frontVisualHeight: 0.16,
  frontVisualDepth: 0.14,
  frontCollisionHeight: 0.3,
  frontCollisionDepth: 0.22,
  sideOffsetX: 0.5,
  sideY: 1.85,
  sideVisualWidth: 0.12,
  sideVisualHeight: 1.05,
  sideDepthExtra: 0.4,
  backOffsetZ: 0.38,
  backYAboveLastRow: 1.05,
  backWidthExtra: 1.4,
  backVisualHeight: 0.14,
  backVisualDepth: 0.16,
  backCollisionHeight: 0.28,
  backCollisionDepth: 0.16
};

export const HALL_LAYOUT = {
  sideWallAbsX: 12.8,
  sideWallY: 2.7,
  sideWallZOffset: -2,
  sideWallWidth: 0.42,
  sideWallHeight: 5.4,
  sideWallDepthExtra: 9.5,
  sconceXAbs: 12.55,
  sconceLightXAbs: 12.1,
  sconceZs: [-3.0, 1.4, 5.8],
  rearWallY: 2.45,
  rearWallZOffset: 1.45,
  rearWallWidthExtra: 7.2,
  rearWallHeight: 4.9,
  rearWallDepth: 0.42,
  prosceniumZ: -12.55,
  prosceniumTopY: 8.1,
  prosceniumTopWidthExtra: 5.2,
  prosceniumTopHeight: 0.64,
  prosceniumTopDepth: 0.52,
  prosceniumLegAbsX: 12.2,
  prosceniumLegY: 4.45,
  prosceniumLegWidth: 0.72,
  prosceniumLegHeight: 7.1,
  prosceniumLegDepth: 0.56
};

export function getStageAccessRampData() {
  const sideStartX = STAGE_SIDE_STAIR.startX;
  const sideEndX = STAGE_SIDE_STAIR.endX;
  const sideZ = STAGE_SIDE_STAIR.centerZ;

  return [
    {
      id: 'stage-left-side-stair-walkable-ramp',
      name: 'Stage left side stair walkable ramp',
      centerX: -(sideStartX + sideEndX) / 2,
      centerZ: sideZ,
      width: Math.abs(sideStartX - sideEndX),
      depth: STAGE_SIDE_STAIR_DEPTH,
      rampAxis: 'x',
      rampStart: -sideStartX,
      rampEnd: -sideEndX,
      rampStartY: 0,
      rampEndY: WORLD.stageHeight
    },
    {
      id: 'stage-right-side-stair-walkable-ramp',
      name: 'Stage right side stair walkable ramp',
      centerX: (sideStartX + sideEndX) / 2,
      centerZ: sideZ,
      width: Math.abs(sideStartX - sideEndX),
      depth: STAGE_SIDE_STAIR_DEPTH,
      rampAxis: 'x',
      rampStart: sideStartX,
      rampEnd: sideEndX,
      rampStartY: 0,
      rampEndY: WORLD.stageHeight
    }
  ].map((ramp) => ({
    ...ramp,
    topY: WORLD.stageHeight
  }));
}

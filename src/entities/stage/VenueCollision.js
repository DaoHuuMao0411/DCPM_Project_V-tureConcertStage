import { AUDIENCE, AUDIENCE_MEMBER_HEIGHT, WORLD } from '../../utils/constants.js';
import {
  getStandAisleRamps,
  getStandBounds,
  getStandColumns,
  getStandRows,
  getStandSeatingBlockBounds
} from '../../utils/venueLayout.js';
import {
  AUDIENCE_BARRIER_LAYOUT,
  HALL_LAYOUT,
  STAGE_LAYOUT,
  getStageAccessRampData
} from './VenueLayoutData.js';

export function createStageCollisionBoxes(config = AUDIENCE) {
  const standBounds = getStandBounds(config);
  const standRows = getStandRows(config);

  return [
    createStageDeckBox(),
    createRunwayBox(),
    createStageBackWallBox(),
    ...createVenueWallBoxes(standBounds),
    createStageWingBox(-1),
    createStageWingBox(1),
    ...createAudienceStairRampBoxes(config),
    ...createStageAccessRampBoxes(),
    ...createAudienceFrontBarrierBoxes(config, standBounds, standRows),
    ...createAudiencePerimeterBarrierBoxes(standBounds, standRows),
    ...createAudienceBlockBoxes(config, standRows)
  ];
}

export function getGrandstandVisibilityBoxIds(config = AUDIENCE) {
  return [
    ...getStandColumns(config).map((column) => `audience-block-${column.id}`),
    ...getStandColumns(config).map((column) => `audience-front-barrier-${column.id}`),
    'audience-back-barrier',
    'audience-left-side-barrier',
    'audience-right-side-barrier'
  ];
}

export function getVenueWallVisibilityBoxIds() {
  return ['wall-left', 'wall-right', 'wall-back'];
}

function createStageDeckBox() {
  const { deck } = STAGE_LAYOUT;
  return {
    id: 'stage-deck',
    name: 'Deck',
    type: 'stage',
    isElevatedSurface: true,
    isWalkableSurface: true,
    topY: WORLD.stageHeight,
    minJumpY: 0.62,
    centerX: deck.centerX,
    centerY: WORLD.stageHeight / 2,
    centerZ: deck.centerZ,
    width: WORLD.stageWidth + deck.collisionPadding.width,
    height: WORLD.stageHeight + deck.collisionPadding.height,
    depth: WORLD.stageDepth + deck.collisionPadding.depth
  };
}

function createRunwayBox() {
  const { runway } = STAGE_LAYOUT;
  return {
    id: 'stage-runway',
    name: 'Runway',
    type: 'runway',
    isElevatedSurface: true,
    isWalkableSurface: true,
    topY: WORLD.runwayHeight,
    minJumpY: runway.minJumpY,
    centerX: runway.centerX,
    centerY: WORLD.runwayHeight / 2,
    centerZ: runway.centerZ,
    width: runway.collisionWidth,
    height: WORLD.runwayHeight + runway.collisionHeightExtra,
    depth: runway.collisionDepth
  };
}

function createStageBackWallBox() {
  const { backWall } = STAGE_LAYOUT;
  return {
    id: 'stage-back-wall',
    name: 'Back wall',
    type: 'stage',
    centerX: backWall.centerX,
    centerY: backWall.centerY,
    centerZ: backWall.centerZ,
    width: WORLD.stageWidth + backWall.collisionWidthExtra,
    height: backWall.collisionHeight,
    depth: backWall.collisionDepth
  };
}

function createStageWingBox(side) {
  const { wings } = STAGE_LAYOUT;
  return {
    id: side < 0 ? 'stage-left-wing' : 'stage-right-wing',
    name: side < 0 ? 'Left wing' : 'Right wing',
    type: 'stage',
    isElevatedSurface: true,
    isWalkableSurface: true,
    topY: wings.height,
    minJumpY: wings.minJumpY,
    centerX: side * wings.centerAbsX,
    centerY: wings.centerY,
    centerZ: wings.centerZ,
    width: wings.collisionWidth,
    height: wings.collisionHeight,
    depth: wings.collisionDepth
  };
}

function createAudienceBlockBoxes(config, standRows) {
  const audienceVisualTopY =
    standRows[standRows.length - 1].y + 0.32 + AUDIENCE_MEMBER_HEIGHT + 0.08;
  const audienceBlockHeight = Math.max(3.1, audienceVisualTopY);

  return getStandSeatingBlockBounds(config).map((block) => ({
    id: `audience-block-${block.id}`,
    name: `${capitalize(block.id)} audience seating block`,
    type: 'audience-seating',
    category: 'grandstand',
    centerX: block.centerX,
    centerY: audienceBlockHeight / 2,
    centerZ: block.centerZ,
    width: block.width,
    height: audienceBlockHeight,
    depth: block.depth + 0.42
  }));
}

function createAudienceFrontBarrierBoxes(config, standBounds, standRows) {
  const layout = AUDIENCE_BARRIER_LAYOUT;
  return getStandSeatingBlockBounds(config).map((block) => ({
    id: `audience-front-barrier-${block.id}`,
    name: `${capitalize(block.id)} audience front barrier`,
    type: 'barrier',
    category: 'grandstand',
    centerX: block.centerX,
    centerY: standRows[0].y + layout.frontYAboveFirstRow,
    centerZ: standBounds.minZ + layout.frontOffsetZ,
    width: block.width,
    height: layout.frontCollisionHeight,
    depth: layout.frontCollisionDepth
  }));
}

function createAudiencePerimeterBarrierBoxes(standBounds, standRows) {
  const layout = AUDIENCE_BARRIER_LAYOUT;
  return [
    {
      id: 'audience-back-barrier',
      name: 'Audience back barrier',
      type: 'barrier',
      category: 'grandstand',
      centerX: 0,
      centerY: standRows[standRows.length - 1].y + layout.backYAboveLastRow,
      centerZ: standBounds.maxZ + layout.backOffsetZ,
      width: standBounds.width + layout.backWidthExtra,
      height: layout.backCollisionHeight,
      depth: layout.backCollisionDepth
    },
    {
      id: 'audience-left-side-barrier',
      name: 'Audience left side barrier',
      type: 'barrier',
      category: 'grandstand',
      centerX: -(standBounds.width / 2 + layout.sideOffsetX),
      centerY: layout.sideY,
      centerZ: standBounds.centerZ,
      width: layout.sideVisualWidth,
      height: layout.sideVisualHeight,
      depth: standBounds.depth + layout.sideDepthExtra
    },
    {
      id: 'audience-right-side-barrier',
      name: 'Audience right side barrier',
      type: 'barrier',
      category: 'grandstand',
      centerX: standBounds.width / 2 + layout.sideOffsetX,
      centerY: layout.sideY,
      centerZ: standBounds.centerZ,
      width: layout.sideVisualWidth,
      height: layout.sideVisualHeight,
      depth: standBounds.depth + layout.sideDepthExtra
    }
  ];
}

function createAudienceStairRampBoxes(config) {
  // Smooth ramp collision intentionally overlays visual stair steps so avatar
  // movement remains stable while climbing grandstand aisles.
  return getStandAisleRamps(config).map((ramp) => ({
    id: `audience-${ramp.id}`,
    name: `${ramp.aisleId} smooth stair aisle ramp`,
    type: 'stair-ramp',
    category: 'grandstand',
    isElevatedSurface: true,
    isWalkableSurface: true,
    isWalkableRamp: true,
    allowStepUp: true,
    rampAxis: ramp.rampAxis,
    rampStart: ramp.rampStart,
    rampEnd: ramp.rampEnd,
    rampStartY: ramp.rampStartY,
    rampEndY: ramp.rampEndY,
    topY: ramp.topY,
    minJumpY: 0,
    centerX: ramp.centerX,
    centerY: ramp.topY / 2,
    centerZ: ramp.centerZ,
    width: ramp.width,
    height: ramp.topY,
    depth: ramp.depth + 0.08
  }));
}

function createStageAccessRampBoxes() {
  // Stage side stairs render as discrete blocks, but collision is a smooth ramp
  // to avoid snagging on individual step edges.
  return getStageAccessRampData().map((ramp) => ({
    id: ramp.id,
    name: ramp.name,
    type: 'stage-stair-ramp',
    category: 'stage',
    isElevatedSurface: true,
    isWalkableSurface: true,
    isWalkableRamp: true,
    allowStepUp: true,
    rampAxis: ramp.rampAxis,
    rampStart: ramp.rampStart,
    rampEnd: ramp.rampEnd,
    rampStartY: ramp.rampStartY,
    rampEndY: ramp.rampEndY,
    topY: ramp.topY,
    minJumpY: 0,
    centerX: ramp.centerX,
    centerY: ramp.topY / 2,
    centerZ: ramp.centerZ,
    width: ramp.width,
    height: ramp.topY,
    depth: ramp.depth
  }));
}

function createVenueWallBoxes(standBounds) {
  const layout = HALL_LAYOUT;
  return [
    {
      id: 'wall-left',
      name: 'Left venue wall',
      type: 'wall',
      category: 'venue',
      centerX: -layout.sideWallAbsX,
      centerY: layout.sideWallY,
      centerZ: standBounds.centerZ + layout.sideWallZOffset,
      width: layout.sideWallWidth,
      height: layout.sideWallHeight,
      depth: standBounds.depth + layout.sideWallDepthExtra
    },
    {
      id: 'wall-right',
      name: 'Right venue wall',
      type: 'wall',
      category: 'venue',
      centerX: layout.sideWallAbsX,
      centerY: layout.sideWallY,
      centerZ: standBounds.centerZ + layout.sideWallZOffset,
      width: layout.sideWallWidth,
      height: layout.sideWallHeight,
      depth: standBounds.depth + layout.sideWallDepthExtra
    },
    {
      id: 'wall-back',
      name: 'Back venue wall',
      type: 'wall',
      category: 'venue',
      centerX: 0,
      centerY: layout.rearWallY,
      centerZ: standBounds.maxZ + layout.rearWallZOffset,
      width: standBounds.width + layout.rearWallWidthExtra,
      height: layout.rearWallHeight,
      depth: layout.rearWallDepth
    }
  ];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

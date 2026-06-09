export class CollisionManager {
  constructor(radius = 0.45) {
    this.radius = radius;
    this.boxes = [];
    this.bounds = null;
    this.version = 0;
  }

  addBox(box) {
    this.boxes.push(normalizeBox(box));
    this.version += 1;
  }

  addBoxes(boxes) {
    boxes.forEach((box) => this.addBox(box));
  }

  clear() {
    this.boxes = [];
    this.version += 1;
  }

  setBounds(bounds) {
    if (!bounds) {
      this.bounds = null;
      this.version += 1;
      return;
    }

    this.bounds = {
      minX: Math.min(bounds.minX, bounds.maxX),
      maxX: Math.max(bounds.minX, bounds.maxX),
      minZ: Math.min(bounds.minZ, bounds.maxZ),
      maxZ: Math.max(bounds.minZ, bounds.maxZ)
    };
    this.version += 1;
  }

  getBoxes() {
    return [...this.boxes];
  }

  resolveMovement(start, target, radius = this.radius, options = {}) {
    const boundedTarget = this.applyBounds(target, radius);
    const resolved = { x: boundedTarget.x, z: boundedTarget.z };
    const xOnly = { x: target.x, z: start.z };

    xOnly.x = boundedTarget.x;
    if (this.intersectsAny(xOnly, radius, options)) {
      resolved.x = start.x;
    }

    const zOnly = { x: resolved.x, z: boundedTarget.z };
    if (this.intersectsAny(zOnly, radius, options)) {
      resolved.z = start.z;
    }
    const stepUpY = this.getStepUpYAt(resolved, radius, options);
    const stepDownY = typeof stepUpY === 'number' ? null : this.getStepDownYAt(resolved, radius, options);

    return {
      x: resolved.x,
      z: resolved.z,
      stepUpY,
      stepDownY,
      steppedUp: typeof stepUpY === 'number',
      steppedDown: typeof stepDownY === 'number',
      collidedX: resolved.x !== target.x,
      collidedZ: resolved.z !== target.z,
      collided: resolved.x !== target.x || resolved.z !== target.z
    };
  }

  intersectsAny(point, radius = this.radius, options = {}) {
    return this.boxes.some((box) => {
      if (isStepUpSurface(point, radius, options, box)) {
        return false;
      }

      if (isTraversableElevatedSurface(point, radius, options, box)) {
        return false;
      }

      return circleIntersectsBox(point, radius, box);
    });
  }

  getGroundYAt(point, radius = this.radius, currentY = 0, previousY = currentY) {
    let groundY = 0;

    this.boxes.forEach((box) => {
      if (!box.isElevatedSurface || !circleIntersectsBox(point, radius, box)) {
        return;
      }

      const topY = getSurfaceYAt(point, box);
      const wasAbove = previousY >= topY - (box.isWalkableRamp ? 0.08 : 0.02);
      const isWithinLandingRange = currentY <= topY + 0.08;
      if (wasAbove && isWithinLandingRange && topY > groundY) {
        groundY = topY;
      }
    });

    return groundY;
  }

  getStepUpYAt(point, radius = this.radius, options = {}) {
    if (!options.canStepUp) {
      return null;
    }

    let stepUpY = null;
    this.boxes.forEach((box) => {
      if (!isStepUpSurface(point, radius, options, box)) {
        return;
      }

      const topY = getSurfaceYAt(point, box);
      if (stepUpY == null || topY > stepUpY) {
        stepUpY = topY;
      }
    });

    return stepUpY;
  }

  getStepDownYAt(point, radius = this.radius, options = {}) {
    if (!options.canStepUp) {
      return null;
    }

    let stepDownY = null;
    this.boxes.forEach((box) => {
      if (!isStepDownSurface(point, radius, options, box)) {
        return;
      }

      const topY = getSurfaceYAt(point, box);
      if (stepDownY == null || topY > stepDownY) {
        stepDownY = topY;
      }
    });

    return stepDownY;
  }

  applyBounds(target, radius = this.radius) {
    if (!this.bounds) {
      return { x: target.x, z: target.z };
    }

    return {
      x: clamp(target.x, this.bounds.minX + radius, this.bounds.maxX - radius),
      z: clamp(target.z, this.bounds.minZ + radius, this.bounds.maxZ - radius)
    };
  }

  raycastAllAABB(origin, direction, maxDistance, options = {}) {
    return this.getRaycastBoxes(options)
      .map((box) => rayIntersectsAABB(origin, direction, maxDistance, box))
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
  }

  getRaycastBoxes(options = {}) {
    if (!options.ids) {
      return this.boxes;
    }

    const ids = options.ids instanceof Set ? options.ids : new Set(options.ids);
    return this.boxes.filter((box) => ids.has(box.id));
  }

}

export function circleIntersectsBox(point, radius, box) {
  const nearestX = clamp(point.x, box.minX, box.maxX);
  const nearestZ = clamp(point.z, box.minZ, box.maxZ);
  const dx = point.x - nearestX;
  const dz = point.z - nearestZ;

  return dx * dx + dz * dz < radius * radius;
}

export function rayIntersectsAABB(origin, direction, maxDistance, box) {
  let tMin = 0;
  let tMax = maxDistance;

  for (const axis of ['x', 'y', 'z']) {
    const min = box[`min${axis.toUpperCase()}`];
    const max = box[`max${axis.toUpperCase()}`];
    const axisOrigin = origin[axis];
    const axisDirection = direction[axis];

    if (Math.abs(axisDirection) < 1e-8) {
      if (axisOrigin < min || axisOrigin > max) {
        return null;
      }
      continue;
    }

    let t1 = (min - axisOrigin) / axisDirection;
    let t2 = (max - axisOrigin) / axisDirection;

    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return null;
    }
  }

  if (tMin < 0 || tMin > maxDistance) {
    return null;
  }

  return {
    box,
    distance: tMin,
    point: {
      x: origin.x + direction.x * tMin,
      y: origin.y + direction.y * tMin,
      z: origin.z + direction.z * tMin
    }
  };
}

function normalizeBox(box) {
  if (typeof box.centerX === 'number') {
    const halfWidth = box.width / 2;
    const halfDepth = box.depth / 2;
    const minY = typeof box.centerY === 'number' ? box.centerY - (box.height ?? 3) / 2 : 0;
    const maxY = typeof box.centerY === 'number' ? box.centerY + (box.height ?? 3) / 2 : box.height ?? 4;
    return {
      id: box.id,
      name: box.name,
      type: box.type,
      category: box.category,
      minX: box.centerX - halfWidth,
      maxX: box.centerX + halfWidth,
      minY,
      maxY,
      minZ: box.centerZ - halfDepth,
      maxZ: box.centerZ + halfDepth,
      isElevatedSurface: Boolean(box.isElevatedSurface),
      isWalkableSurface: Boolean(box.isWalkableSurface),
      isWalkableRamp: Boolean(box.isWalkableRamp),
      allowStepUp: Boolean(box.allowStepUp),
      rampAxis: box.rampAxis,
      rampStart: box.rampStart,
      rampEnd: box.rampEnd,
      rampStartY: box.rampStartY,
      rampEndY: box.rampEndY,
      topY: typeof box.topY === 'number' ? box.topY : maxY,
      minJumpY: typeof box.minJumpY === 'number' ? box.minJumpY : box.topY ?? maxY
    };
  }

  const minY = Math.min(box.minY ?? 0, box.maxY ?? box.height ?? 4);
  const maxY = Math.max(box.minY ?? 0, box.maxY ?? box.height ?? 4);
  return {
    id: box.id,
    name: box.name,
    type: box.type,
    category: box.category,
    minX: Math.min(box.minX, box.maxX),
    maxX: Math.max(box.minX, box.maxX),
    minY,
    maxY,
    minZ: Math.min(box.minZ, box.maxZ),
    maxZ: Math.max(box.minZ, box.maxZ),
    isElevatedSurface: Boolean(box.isElevatedSurface),
    isWalkableSurface: Boolean(box.isWalkableSurface),
    isWalkableRamp: Boolean(box.isWalkableRamp),
    allowStepUp: Boolean(box.allowStepUp),
    rampAxis: box.rampAxis,
    rampStart: box.rampStart,
    rampEnd: box.rampEnd,
    rampStartY: box.rampStartY,
    rampEndY: box.rampEndY,
    topY: typeof box.topY === 'number' ? box.topY : maxY,
    minJumpY: typeof box.minJumpY === 'number' ? box.minJumpY : box.topY ?? maxY
  };
}

function isTraversableElevatedSurface(point, radius, options = {}, box) {
  if (!box.isElevatedSurface || !circleIntersectsBox(point, radius, box)) {
    return false;
  }

  const y = finiteOr(options.y, 0);
  const supportY = finiteOr(options.supportY, y);
  if (box.isWalkableRamp && !box.isWalkableSurface) {
    return false;
  }

  if (box.isWalkableRamp && box.isWalkableSurface && box.allowStepUp) {
    const maxStepUpHeight = Math.max(0, finiteOr(options.maxStepUpHeight, 0));
    return Math.max(y, supportY) >= getSurfaceYAt(point, box) - maxStepUpHeight - 0.001;
  }

  const topY = getSurfaceYAt(point, box);
  if (options.canStepUp && !box.allowStepUp && topY > supportY + 0.001) {
    return false;
  }

  return Math.max(y, supportY) >= (box.minJumpY ?? topY);
}

function isStepUpSurface(point, radius, options = {}, box) {
  if (
    !options.canStepUp ||
    !box.isElevatedSurface ||
    !box.isWalkableSurface ||
    !box.allowStepUp ||
    !circleIntersectsBox(point, radius, box)
  ) {
    return false;
  }

  const supportY = finiteOr(options.supportY, 0);
  const maxStepUpHeight = Math.max(0, finiteOr(options.maxStepUpHeight, 0));
  const topY = getSurfaceYAt(point, box);
  const heightDelta = topY - supportY;

  return heightDelta > 0.001 && heightDelta <= maxStepUpHeight + 0.001;
}

function isStepDownSurface(point, radius, options = {}, box) {
  if (
    !options.canStepUp ||
    !box.isElevatedSurface ||
    !box.isWalkableSurface ||
    !box.allowStepUp ||
    !circleIntersectsBox(point, radius, box)
  ) {
    return false;
  }

  const supportY = finiteOr(options.supportY, 0);
  const maxStepDownHeight = Math.max(0, finiteOr(options.maxStepUpHeight, 0));
  const topY = getSurfaceYAt(point, box);
  const heightDelta = supportY - topY;

  return heightDelta > 0.001 && heightDelta <= maxStepDownHeight + 0.001;
}

export function getSurfaceYAt(point, box) {
  if (!box.isWalkableRamp) {
    return box.topY ?? box.maxY;
  }

  const axis = box.rampAxis === 'x' ? 'x' : 'z';
  const coordinate = finiteOr(point[axis], 0);
  const start = finiteOr(box.rampStart, box[`min${axis.toUpperCase()}`]);
  const end = finiteOr(box.rampEnd, box[`max${axis.toUpperCase()}`]);
  const startY = finiteOr(box.rampStartY, 0);
  const endY = finiteOr(box.rampEndY, box.topY ?? box.maxY);

  if (Math.abs(end - start) < 0.0001) {
    return endY;
  }

  const t = clamp((coordinate - start) / (end - start), 0, 1);
  return startY + (endY - startY) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

import { lerp } from '../utils/math.js';

export class AvatarVisibilityManager {
  constructor(collisionManager, options = {}) {
    this.collisionManager = collisionManager;
    this.minOpacity = options.minOpacity ?? 0.34;
    this.fadeInRate = options.fadeInRate ?? 7.5;
    this.fadeOutRate = options.fadeOutRate ?? 4.5;
    this.targets = [];
    this.activeBoxIds = new Set();
  }

  registerTarget(target) {
    const meshes = collectMeshes(target.objects ?? target.object);
    const materialStates = [];

    meshes.forEach((mesh) => {
      cloneMeshMaterials(mesh).forEach((material) => {
        materialStates.push({
          material,
          originalOpacity: material.opacity,
          originalTransparent: material.transparent,
          originalDepthWrite: material.depthWrite
        });
      });
    });

    this.targets.push({
      id: target.id,
      boxIds: target.boxIds ?? [target.id],
      meshes,
      materialStates,
      opacity: 1
    });
  }

  registerTargets(targets) {
    targets.forEach((target) => this.registerTarget(target));
  }

  update(cameraPosition, avatarTargetPosition, deltaTime) {
    const boxIds = new Set(this.targets.flatMap((target) => target.boxIds));
    const obstructionHits = findVisibilityObstructions(
      this.collisionManager,
      cameraPosition,
      avatarTargetPosition,
      boxIds
    );

    this.activeBoxIds = new Set(obstructionHits.map((hit) => hit.box.id));
    const activeTargetIds = [];

    this.targets.forEach((target) => {
      const isActive = target.boxIds.some((boxId) => this.activeBoxIds.has(boxId));
      if (isActive) {
        activeTargetIds.push(target.id);
      }

      const targetOpacity = isActive ? this.minOpacity : 1;
      const rate = isActive ? this.fadeInRate : this.fadeOutRate;
      target.opacity = lerp(target.opacity, targetOpacity, 1 - Math.exp(-rate * deltaTime));
      applyFade(target.materialStates, target.opacity);
    });

    return {
      isObstructed: activeTargetIds.length > 0,
      activeTargetIds,
      hits: obstructionHits
    };
  }
}

export function findVisibilityObstructions(collisionManager, cameraPosition, targetPosition, boxIds) {
  const delta = {
    x: targetPosition.x - cameraPosition.x,
    y: targetPosition.y - cameraPosition.y,
    z: targetPosition.z - cameraPosition.z
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);

  if (distance <= 0.001) {
    return [];
  }

  const direction = {
    x: delta.x / distance,
    y: delta.y / distance,
    z: delta.z / distance
  };

  return collisionManager.raycastAllAABB(cameraPosition, direction, distance, { ids: boxIds });
}

export function applyFade(materialStates, opacity) {
  materialStates.forEach((state) => {
    if (opacity >= 0.995) {
      state.material.opacity = state.originalOpacity;
      state.material.transparent = state.originalTransparent;
      state.material.depthWrite = state.originalDepthWrite;
      return;
    }

    state.material.opacity = Math.min(state.originalOpacity, opacity);
    state.material.transparent = true;
    state.material.depthWrite = false;
  });
}

function collectMeshes(objects) {
  const roots = Array.isArray(objects) ? objects : [objects];
  const meshes = [];

  roots.filter(Boolean).forEach((object) => {
    object.traverse?.((child) => {
      if (child.isMesh && child.material) {
        meshes.push(child);
      }
    });

    if (object.isMesh && object.material && !meshes.includes(object)) {
      meshes.push(object);
    }
  });

  return meshes;
}

function cloneMeshMaterials(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const clonedMaterials = materials.map((material) => material.clone());
  mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
  return clonedMaterials;
}

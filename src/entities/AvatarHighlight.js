import { clamp, lerp } from '../utils/math.js';

export class AvatarHighlight {
  constructor(options = {}) {
    this.activeOpacity = options.activeOpacity ?? 0.42;
    this.inactiveOpacity = options.inactiveOpacity ?? 0;
    this.fadeRate = options.fadeRate ?? 7.5;
    this.pulseAmount = options.pulseAmount ?? 0.12;
    this.pulseSpeed = options.pulseSpeed ?? 4;
    this.baseScale = options.baseScale ?? 1;
    this.opacity = this.inactiveOpacity;
    this.isActive = false;
    this.materials = [];
    this.scaleTargets = [];
  }

  addMaterial(material) {
    if (material) {
      this.materials.push(material);
      material.opacity = this.opacity;
      material.transparent = true;
      material.depthWrite = false;
    }
  }

  addScaleTarget(target) {
    if (target) {
      this.scaleTargets.push(target);
    }
  }

  setActive(isActive) {
    this.isActive = isActive;
  }

  update(deltaTime, elapsedTime = 0) {
    const targetOpacity = this.isActive ? this.activeOpacity : this.inactiveOpacity;
    const alpha = 1 - Math.exp(-this.fadeRate * deltaTime);
    this.opacity = clamp(lerp(this.opacity, targetOpacity, alpha), this.inactiveOpacity, this.activeOpacity);

    const pulse = this.isActive
      ? 1 + (Math.sin(elapsedTime * this.pulseSpeed) * 0.5 + 0.5) * this.pulseAmount
      : 1;
    const materialOpacity = clamp(
      this.opacity * (this.isActive ? 0.88 + (pulse - 1) : 1),
      this.inactiveOpacity,
      this.activeOpacity
    );

    this.materials.forEach((material) => {
      material.opacity = materialOpacity;
      material.visible = materialOpacity > 0.01;
    });

    this.scaleTargets.forEach((target) => {
      target.visible = materialOpacity > 0.01;
      target.scale.setScalar(this.baseScale * pulse);
    });

    return this.opacity;
  }

}

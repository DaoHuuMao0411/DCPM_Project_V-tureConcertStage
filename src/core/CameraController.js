import * as THREE from 'three';
import { CAMERA } from '../utils/constants.js';
import { clamp, lerp } from '../utils/math.js';

export class CameraController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.targetPosition = new THREE.Vector3();
    this.followDistance = CAMERA.followDistance;
    this.mouseSensitivity = 1;
    this.isInitialized = false;
  }

  setMouseSensitivity(value) {
    this.mouseSensitivity = clamp(Number(value), 0.2, 3);
  }

  setFollowDistance(value) {
    this.followDistance = clamp(
      Number(value),
      CAMERA.minFollowDistance,
      CAMERA.maxFollowDistance
    );
    return this.followDistance;
  }

  applyWheelZoom(wheelDelta) {
    const delta = Number(wheelDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      return this.followDistance;
    }

    return this.setFollowDistance(this.followDistance + delta * CAMERA.zoomSensitivity);
  }

  getFollowDistance() {
    return this.followDistance;
  }

  update(deltaTime, avatar) {
    const step = Math.max(0, Math.min(deltaTime, 0.1));
    const mouse = this.input.consumeMouseDelta();
    const wheelDelta =
      typeof this.input.consumeWheelDelta === 'function' ? this.input.consumeWheelDelta() : 0;
    this.applyWheelZoom(wheelDelta);
    const sensitivity = CAMERA.sensitivity * this.mouseSensitivity;
    this.yaw -= mouse.x * sensitivity;
    this.pitch = clamp(
      this.pitch + mouse.y * sensitivity,
      CAMERA.minPitch,
      CAMERA.maxPitch
    );

    const avatarPosition = avatar.getPosition();
    const lookAt = avatarPosition.clone().add(new THREE.Vector3(0, 1.25, 0));
    const orbit = new THREE.Vector3(
      Math.sin(this.yaw) * this.followDistance,
      CAMERA.height + Math.sin(this.pitch) * 2,
      Math.cos(this.yaw) * this.followDistance
    );

    const desiredPosition = avatarPosition.clone().add(orbit);
    this.targetPosition.copy(desiredPosition);

    if (!this.isInitialized) {
      this.camera.position.copy(this.targetPosition);
      this.isInitialized = true;
    } else {
      const positionAlpha = smoothingAlpha(CAMERA.followPositionRate, step);
      this.camera.position.x = lerp(this.camera.position.x, this.targetPosition.x, positionAlpha);
      this.camera.position.y = lerp(this.camera.position.y, this.targetPosition.y, positionAlpha);
      this.camera.position.z = lerp(this.camera.position.z, this.targetPosition.z, positionAlpha);
    }
    this.camera.lookAt(lookAt);
  }

  getYaw() {
    return this.yaw;
  }

}

function smoothingAlpha(rate, deltaTime) {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, deltaTime));
}

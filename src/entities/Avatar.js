import * as THREE from 'three';
import { AVATAR_HEIGHT, PLAYER, WORLD } from '../utils/constants.js';
import { clamp } from '../utils/math.js';
import { AvatarHighlight } from './AvatarHighlight.js';
import { STAGE_LAYOUT } from './stage/VenueLayoutData.js';

export class Avatar {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PlayerAvatar';
    this.group.position.set(STAGE_LAYOUT.deck.centerX, WORLD.stageHeight, STAGE_LAYOUT.deck.centerZ);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.wasJumpDown = false;
    this.coyoteTimeRemaining = PLAYER.coyoteTimeSeconds;
    this.jumpBufferRemaining = 0;
    this.isSprinting = false;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.desiredDirection = new THREE.Vector3();
    this.actualMovement = new THREE.Vector3();
    this.visualRoot = new THREE.Group();
    this.visualRoot.name = 'AvatarVisuals';
    this.highlight = new AvatarHighlight({
      activeOpacity: 0.42,
      fadeRate: 8.5,
      pulseAmount: 0.08,
      baseScale: 1
    });

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f89ff,
      roughness: 0.48,
      metalness: 0.05
    });
    const suitMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.22
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5c28b,
      roughness: 0.55
    });
    const emissiveAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      roughness: 0.26,
      metalness: 0.12,
      emissive: 0x0e7490,
      emissiveIntensity: 0.32
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 12), bodyMaterial);
    body.position.y = 1.05;
    body.castShadow = true;

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.08, 0.5), suitMaterial);
    belt.position.y = 0.76;
    belt.castShadow = true;

    const shoulderGeometry = new THREE.SphereGeometry(0.16, 12, 8);
    const armGeometry = new THREE.CapsuleGeometry(0.085, 0.58, 5, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeometry, suitMaterial);
    leftShoulder.position.set(-0.48, 1.43, 0.02);
    leftShoulder.scale.set(1.35, 0.78, 1);
    leftShoulder.castShadow = true;

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = 0.48;

    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.55, 1.04, 0.02);
    leftArm.rotation.z = 0.16;
    leftArm.castShadow = true;

    const rightArm = leftArm.clone();
    rightArm.position.x = 0.55;
    rightArm.rotation.z = -0.16;

    const legGeometry = new THREE.CapsuleGeometry(0.115, 0.6, 5, 8);
    const leftLeg = new THREE.Mesh(legGeometry, suitMaterial);
    leftLeg.position.set(-0.17, 0.38, 0);
    leftLeg.castShadow = true;

    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.17;

    const bootGeometry = new THREE.BoxGeometry(0.24, 0.12, 0.36);
    const leftBoot = new THREE.Mesh(bootGeometry, suitMaterial);
    leftBoot.position.set(-0.17, 0.08, 0.08);
    leftBoot.castShadow = true;

    const rightBoot = leftBoot.clone();
    rightBoot.position.x = 0.17;

    const headRadius = 0.34;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 20, 16), headMaterial);
    head.position.y = AVATAR_HEIGHT - headRadius;
    head.castShadow = true;

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.345, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), suitMaterial);
    hair.position.y = AVATAR_HEIGHT - headRadius + 0.08;
    hair.castShadow = true;

    // Avatar visual forward is local +Z; AudioManager maps that into Web Audio.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.055), emissiveAccentMaterial);
    visor.position.set(0, 2.0, 0.31);

    this.visualRoot.add(
      body,
      belt,
      leftShoulder,
      rightShoulder,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftBoot,
      rightBoot,
      head,
      hair,
      visor
    );
    this.group.add(this.visualRoot, this.createHighlightHalo(), this.createLabel(PLAYER.id));
  }

  update(deltaTime, input, cameraYaw, collisionManager) {
    const step = Math.max(0, Math.min(deltaTime, 0.1));
    this.desiredDirection.set(0, 0, 0);
    this.forward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw)).normalize();
    this.right.set(-this.forward.z, 0, this.forward.x).normalize();

    if (input.isDown('KeyW')) this.desiredDirection.sub(this.forward);
    if (input.isDown('KeyS')) this.desiredDirection.add(this.forward);
    if (input.isDown('KeyA')) this.desiredDirection.add(this.right);
    if (input.isDown('KeyD')) this.desiredDirection.sub(this.right);

    const hasMovementInput = this.desiredDirection.lengthSq() > 0;
    this.isSprinting =
      hasMovementInput && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    const maxSpeed = this.isSprinting ? PLAYER.sprintSpeed : PLAYER.moveSpeed;

    if (hasMovementInput) {
      this.desiredDirection.normalize();
      this.applyHorizontalAcceleration(
        this.desiredDirection.x * maxSpeed,
        this.desiredDirection.z * maxSpeed,
        (this.isGrounded ? PLAYER.acceleration : PLAYER.airAcceleration) * step
      );
    } else {
      this.applyHorizontalFriction(PLAYER.deceleration * step);
    }

    this.clampHorizontalSpeed(maxSpeed);

    this.updateJumpTimers(step, input.isDown('Space'));
    this.consumeBufferedJump();

    this.velocity.y -= PLAYER.gravity * step;

    const currentPosition = this.group.position;
    const previousPosition = currentPosition.clone();
    const previousY = currentPosition.y;
    const targetPosition = currentPosition.clone().addScaledVector(this.velocity, step);

    if (collisionManager) {
      const resolved = collisionManager.resolveMovement(currentPosition, targetPosition, PLAYER.radius, {
        y: targetPosition.y,
        supportY: currentPosition.y,
        canStepUp: this.isGrounded,
        maxStepUpHeight: PLAYER.maxStepUpHeight
      });
      targetPosition.x = resolved.x;
      targetPosition.z = resolved.z;

      if (typeof resolved.stepUpY === 'number') {
        targetPosition.y = resolved.stepUpY;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.coyoteTimeRemaining = PLAYER.coyoteTimeSeconds;
      } else if (typeof resolved.stepDownY === 'number') {
        targetPosition.y = resolved.stepDownY;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.coyoteTimeRemaining = PLAYER.coyoteTimeSeconds;
      }

      if (resolved.collidedX) {
        this.velocity.x = 0;
      }

      if (resolved.collidedZ) {
        this.velocity.z = 0;
      }
    }

    this.group.position.copy(targetPosition);
    this.updateFacingFromMovement(hasMovementInput, previousPosition);

    const groundY = collisionManager
      ? collisionManager.getGroundYAt(this.group.position, PLAYER.radius, this.group.position.y, previousY)
      : PLAYER.groundY;

    if (this.group.position.y <= groundY) {
      this.group.position.y = groundY;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.coyoteTimeRemaining = PLAYER.coyoteTimeSeconds;
      this.consumeBufferedJump();
    }
  }

  setYaw(cameraYaw) {
    this.group.rotation.y = cameraYaw - Math.PI;
  }

  setFacingDirection(direction) {
    if (!direction || direction.lengthSq() === 0) {
      return;
    }

    this.group.rotation.y = Math.atan2(direction.x, direction.z);
  }

  updateFacingFromMovement(hasMovementInput, previousPosition) {
    if (!hasMovementInput) {
      return;
    }

    this.actualMovement
      .copy(this.group.position)
      .sub(previousPosition)
      .setY(0);

    if (this.actualMovement.lengthSq() > 0.000001) {
      this.setFacingDirection(this.actualMovement);
    }
  }

  updateJumpTimers(deltaTime, isJumpDown) {
    if (this.isGrounded) {
      this.coyoteTimeRemaining = PLAYER.coyoteTimeSeconds;
    } else {
      this.coyoteTimeRemaining = Math.max(0, this.coyoteTimeRemaining - deltaTime);
    }

    if (isJumpDown && !this.wasJumpDown) {
      this.jumpBufferRemaining = PLAYER.jumpBufferSeconds;
    } else if (this.jumpBufferRemaining > 0) {
      this.jumpBufferRemaining = Math.max(0, this.jumpBufferRemaining - deltaTime);
    }

    this.wasJumpDown = isJumpDown;
  }

  consumeBufferedJump() {
    if (this.jumpBufferRemaining <= 0 || !this.canStartJump()) {
      return false;
    }

    this.velocity.y = PLAYER.jumpVelocity;
    this.isGrounded = false;
    this.coyoteTimeRemaining = 0;
    this.jumpBufferRemaining = 0;
    return true;
  }

  canStartJump() {
    return this.isGrounded || this.coyoteTimeRemaining > 0;
  }

  applyHorizontalAcceleration(targetX, targetZ, maxDelta) {
    const deltaX = targetX - this.velocity.x;
    const deltaZ = targetZ - this.velocity.z;
    const deltaLength = Math.hypot(deltaX, deltaZ);

    if (deltaLength <= maxDelta || deltaLength === 0) {
      this.velocity.x = targetX;
      this.velocity.z = targetZ;
      return;
    }

    const scale = maxDelta / deltaLength;
    this.velocity.x += deltaX * scale;
    this.velocity.z += deltaZ * scale;
  }

  applyHorizontalFriction(amount) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (speed <= amount || speed === 0) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    const nextSpeed = speed - amount;
    const scale = nextSpeed / speed;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  clampHorizontalSpeed(maxSpeed) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (speed <= maxSpeed || speed === 0) {
      return;
    }

    const clampedSpeed = clamp(maxSpeed, 0, PLAYER.sprintSpeed);
    const scale = clampedSpeed / speed;
    this.velocity.x *= scale;
    this.velocity.z *= scale;
  }

  getPosition() {
    return this.group.position;
  }

  setOcclusionHighlightActive(isActive) {
    this.highlight.setActive(isActive);
  }

  updateHighlight(deltaTime, elapsedTime) {
    this.highlight.update(deltaTime, elapsedTime);
  }

  createHighlightHalo() {
    const group = new THREE.Group();
    group.name = 'AvatarOcclusionHighlight';

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ringMaterial = haloMaterial.clone();

    const bodyHalo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 8, 48), haloMaterial);
    bodyHalo.position.y = 1.08;
    bodyHalo.rotation.x = Math.PI / 2;
    bodyHalo.renderOrder = 20;

    const groundRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.025, 8, 48), ringMaterial);
    groundRing.position.y = 0.08;
    groundRing.rotation.x = Math.PI / 2;
    groundRing.renderOrder = 20;

    group.visible = false;
    group.add(bodyHalo, groundRing);
    this.highlight.addMaterial(haloMaterial);
    this.highlight.addMaterial(ringMaterial);
    this.highlight.addScaleTarget(group);

    return group;
  }

  createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(4, 7, 12, 0.72)';
    context.fillRect(0, 10, 256, 54);
    context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    context.lineWidth = 3;
    context.strokeRect(2, 12, 252, 50);
    context.fillStyle = '#ffffff';
    context.font = 'bold 30px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 39);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = AVATAR_HEIGHT + 0.51;
    sprite.scale.set(2.4, 0.75, 1);
    return sprite;
  }
}

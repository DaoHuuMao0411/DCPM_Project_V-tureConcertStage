import * as THREE from 'three';
import { randomRange } from '../utils/math.js';
import { AUDIENCE_MEMBER_HEIGHT } from '../utils/constants.js';
import { createAudienceSeatPlacements } from '../utils/venueLayout.js';

const REACTION_SETTINGS = {
  low: { bounce: 0.06, arm: 0.14, speed: 1.8, sync: 0.1, emissive: 0.02 },
  medium: { bounce: 0.28, arm: 0.7, speed: 3.1, sync: 0.55, emissive: 0.16 },
  high: { bounce: 0.62, arm: 1.2, speed: 5.1, sync: 0.85, emissive: 0.38 }
};

const BASE_AUDIENCE_MEMBER_HEIGHT = 1.31;
const AUDIENCE_VERTICAL_SCALE = AUDIENCE_MEMBER_HEIGHT / BASE_AUDIENCE_MEMBER_HEIGHT;
const AUDIENCE_WIDTH_SCALE = 1.22;

export function createAudienceVariation(row = 0, seat = 0, random = Math.random) {
  const safeRandom = typeof random === 'function' ? random : Math.random;
  const shapeSeed = (row * 7 + seat * 11) % 3;
  return {
    bodyScaleX: randomRangeWith(safeRandom, 0.86, 1.12),
    bodyScaleY: randomRangeWith(safeRandom, 0.88, 1.18),
    headScale: randomRangeWith(safeRandom, 0.9, 1.12),
    armLength: randomRangeWith(safeRandom, 0.88, 1.18),
    shoulderWidth: randomRangeWith(safeRandom, 0.9, 1.16),
    stance: randomRangeWith(safeRandom, -0.08, 0.08),
    headTilt: randomRangeWith(safeRandom, -0.08, 0.08),
    cheerOffset: randomRangeWith(safeRandom, 0.82, 1.18),
    glowSide: safeRandom() > 0.5 ? 1 : -1,
    skinTone: safeRandom(),
    accessory: shapeSeed === 0 && safeRandom() > 0.35 ? 'cap' : shapeSeed === 1 && safeRandom() > 0.72 ? 'glow' : 'none',
    silhouette: shapeSeed
  };
}

export class Audience {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Audience';
    this.members = [];
    this.glowAccents = [];
    this.reactionIntensity = 1;
    this.createSharedGeometry();
    this.buildMembers();
  }

  createSharedGeometry() {
    this.geometry = {
      capsuleBody: new THREE.CapsuleGeometry(0.22, 0.58, 5, 10),
      boxBody: new THREE.BoxGeometry(0.42, 0.82, 0.24),
      head: new THREE.SphereGeometry(0.19, 14, 10),
      arm: new THREE.BoxGeometry(0.1, 0.54, 0.1),
      hand: new THREE.SphereGeometry(0.07, 8, 6),
      shoulder: new THREE.BoxGeometry(0.62, 0.12, 0.22),
      frontPanel: new THREE.BoxGeometry(0.28, 0.4, 0.026),
      glasses: new THREE.BoxGeometry(0.28, 0.035, 0.025),
      cap: new THREE.CylinderGeometry(0.2, 0.22, 0.08, 14),
      glow: new THREE.SphereGeometry(0.055, 8, 6),
      glowStick: new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8)
    };
    this.materials = {
      cap: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.46, metalness: 0.12 }),
      panel: new THREE.MeshStandardMaterial({
        color: 0x172033,
        roughness: 0.5,
        metalness: 0.08,
        emissive: 0x020617,
        emissiveIntensity: 0.04
      }),
      glasses: new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.25,
        metalness: 0.18,
        emissive: 0x020617,
        emissiveIntensity: 0.08
      }),
      glow: new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        roughness: 0.34,
        emissive: 0x0e7490,
        emissiveIntensity: 0.28
      })
    };
  }

  buildMembers() {
    createAudienceSeatPlacements().forEach((placement) => {
      const member = this.createMember(placement);
      this.members.push(member);
      this.group.add(member.root);
    });
  }

  createMember(placement) {
    const x = placement.x + randomRange(-0.09, 0.09);
    const z = placement.z + randomRange(-0.06, 0.06);
    const y = placement.y;
    const hue = (placement.row * 38 + placement.globalSeatIndex * 19) % 360;
    const variation = createAudienceVariation(placement.row, placement.globalSeatIndex);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${hue}, 68%, 52%)`),
      roughness: 0.56,
      emissive: new THREE.Color(`hsl(${hue}, 68%, 24%)`),
      emissiveIntensity: 0.02
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: getSkinTone(variation.skinTone),
      roughness: 0.62
    });
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = Math.PI + randomRange(-0.18, 0.18) + variation.stance;
    root.userData.row = placement.row;
    root.userData.columnId = placement.columnId;
    root.userData.seat = placement.seat;

    const bodyGeometry = variation.silhouette === 1 ? this.geometry.boxBody : this.geometry.capsuleBody;
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.62 * AUDIENCE_VERTICAL_SCALE;
    body.scale.set(
      variation.bodyScaleX * AUDIENCE_WIDTH_SCALE,
      variation.bodyScaleY * AUDIENCE_VERTICAL_SCALE,
      AUDIENCE_WIDTH_SCALE * 0.92
    );
    body.castShadow = true;

    const shoulders = new THREE.Mesh(this.geometry.shoulder, this.materials.trim);
    shoulders.position.y = (0.92 + (variation.bodyScaleY - 1) * 0.08) * AUDIENCE_VERTICAL_SCALE;
    shoulders.scale.set(
      variation.shoulderWidth * AUDIENCE_WIDTH_SCALE,
      AUDIENCE_VERTICAL_SCALE,
      AUDIENCE_WIDTH_SCALE
    );
    shoulders.castShadow = true;

    const frontPanel = new THREE.Mesh(this.geometry.frontPanel, this.materials.panel);
    frontPanel.position.set(0, 0.68 * AUDIENCE_VERTICAL_SCALE, 0.13 * AUDIENCE_WIDTH_SCALE);
    frontPanel.scale.set(
      variation.bodyScaleX * AUDIENCE_WIDTH_SCALE,
      variation.bodyScaleY * AUDIENCE_VERTICAL_SCALE,
      AUDIENCE_WIDTH_SCALE
    );

    const head = new THREE.Mesh(this.geometry.head, skinMaterial);
    head.position.y = (1.12 + (variation.bodyScaleY - 1) * 0.18) * AUDIENCE_VERTICAL_SCALE;
    head.scale.setScalar(variation.headScale * AUDIENCE_VERTICAL_SCALE);
    head.rotation.z = variation.headTilt;
    head.castShadow = true;

    const leftArm = new THREE.Mesh(this.geometry.arm, bodyMaterial);
    leftArm.position.set(
      -0.32 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE,
      0.72 * AUDIENCE_VERTICAL_SCALE,
      0
    );
    leftArm.scale.set(
      AUDIENCE_WIDTH_SCALE,
      variation.armLength * AUDIENCE_VERTICAL_SCALE,
      AUDIENCE_WIDTH_SCALE
    );
    leftArm.castShadow = true;

    const rightArm = leftArm.clone();
    rightArm.position.x = 0.32 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE;

    const leftHand = new THREE.Mesh(this.geometry.hand, skinMaterial);
    leftHand.position.set(
      -0.32 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE,
      0.4 * AUDIENCE_VERTICAL_SCALE,
      0.02
    );
    leftHand.castShadow = true;

    const rightHand = leftHand.clone();
    rightHand.position.x = 0.32 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE;

    root.add(body, shoulders, frontPanel, head, leftArm, rightArm, leftHand, rightHand);

    if (variation.accessory === 'cap') {
      const cap = new THREE.Mesh(this.geometry.cap, this.materials.cap);
      cap.position.y = head.position.y + 0.19 * variation.headScale * AUDIENCE_VERTICAL_SCALE;
      cap.scale.setScalar(variation.headScale * AUDIENCE_VERTICAL_SCALE);
      root.add(cap);
    } else if (variation.accessory === 'glow') {
      const glow = new THREE.Mesh(this.geometry.glow, this.materials.glow.clone());
      glow.position.set(
        variation.glowSide * 0.28 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE,
        1.05 * AUDIENCE_VERTICAL_SCALE,
        0.04
      );
      glow.scale.setScalar(AUDIENCE_WIDTH_SCALE);
      this.glowAccents.push(glow);
      root.add(glow);
    }

    if (placement.globalSeatIndex % 5 === 0) {
      const glasses = new THREE.Mesh(this.geometry.glasses, this.materials.glasses);
      glasses.position.set(0, head.position.y + 0.02, 0.17 * variation.headScale);
      glasses.scale.setScalar(variation.headScale * AUDIENCE_VERTICAL_SCALE);
      root.add(glasses);
    }

    if ((placement.row + placement.globalSeatIndex) % 4 === 0) {
      const glowStick = new THREE.Mesh(this.geometry.glowStick, this.materials.glow.clone());
      glowStick.position.set(
        variation.glowSide * 0.41 * variation.shoulderWidth * AUDIENCE_WIDTH_SCALE,
        0.74 * AUDIENCE_VERTICAL_SCALE,
        0.05
      );
      glowStick.rotation.z = variation.glowSide * 0.34;
      glowStick.castShadow = false;
      this.glowAccents.push(glowStick);
      root.add(glowStick);
    }

    return {
      root,
      bodyMaterial,
      leftArm,
      rightArm,
      leftHand,
      rightHand,
      baseY: y,
      phase: randomRange(0, Math.PI * 2),
      swayScale: randomRange(0.75, 1.25),
      cheerOffset: variation.cheerOffset,
      beatPulse: 0,
      row: placement.row,
      columnId: placement.columnId
    };
  }

  setReactionIntensity(value) {
    this.reactionIntensity = Math.min(2, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 1));
  }

  update(metrics, time) {
    const audioScore = metrics.audioScore;
    const reactionSettings = REACTION_SETTINGS[metrics.reactionLevel] ?? REACTION_SETTINGS.low;
    const intensity = this.reactionIntensity;
    const reactionEnergy = Math.max(metrics.smoothedEnergy, audioScore, 0.04) * intensity;
    const sharedBeatPhase = Math.sin(time * reactionSettings.speed * 2.2);

    this.members.forEach((member, index) => {
      if (metrics.isBeat) {
        member.beatPulse = Math.max(member.beatPulse, (1 - member.row * 0.05) * intensity);
      }

      member.beatPulse = Math.max(0, member.beatPulse - 0.085);
      const memberPhase = time * reactionSettings.speed + member.phase + index * 0.08;
      const individualWave = Math.sin(memberPhase);
      const crowdWave =
        sharedBeatPhase * reactionSettings.sync + individualWave * (1 - reactionSettings.sync);
      const bounce =
        Math.max(0, crowdWave) * reactionSettings.bounce * intensity * (0.7 + reactionEnergy) +
        member.beatPulse * (0.12 + reactionSettings.bounce * 0.42);
      member.root.position.y = member.baseY + bounce;
      member.root.rotation.z =
        Math.sin(memberPhase * 0.6) * reactionSettings.bounce * 0.16 * intensity * member.swayScale;
      member.leftArm.rotation.z =
        -0.35 - Math.sin(memberPhase) * reactionSettings.arm * intensity - member.beatPulse * 0.28;
      member.rightArm.rotation.z =
        0.35 + Math.sin(memberPhase + 0.6) * reactionSettings.arm * intensity + member.beatPulse * 0.28;
      member.leftHand.position.y =
        0.4 * AUDIENCE_VERTICAL_SCALE +
        (0.08 + reactionSettings.arm * 0.12) * Math.max(0, individualWave) * intensity * member.cheerOffset +
        member.beatPulse * 0.08;
      member.rightHand.position.y =
        0.4 * AUDIENCE_VERTICAL_SCALE +
        (0.08 + reactionSettings.arm * 0.12) * Math.max(0, Math.sin(memberPhase + 0.6)) * intensity * member.cheerOffset +
        member.beatPulse * 0.08;
      member.bodyMaterial.emissiveIntensity =
        reactionSettings.emissive + audioScore * 0.28 * intensity + member.beatPulse * 0.35;
    });

    this.glowAccents.forEach((glow, index) => {
      glow.material.emissiveIntensity =
        0.16 +
        audioScore * 0.55 * intensity +
        Math.max(0, Math.sin(time * reactionSettings.speed + index * 0.37)) * 0.12;
    });
  }
}

function randomRangeWith(random, min, max) {
  return min + random() * (max - min);
}

function getSkinTone(seed) {
  const tones = [0xf0ba86, 0xd99a6c, 0x8f5f3e, 0xf4c7a1];
  const index = Math.min(tones.length - 1, Math.floor(Math.max(0, Math.min(0.999, seed)) * tones.length));
  return tones[index];
}

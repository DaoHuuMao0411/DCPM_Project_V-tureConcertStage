import * as THREE from 'three';
import { WORLD } from '../utils/constants.js';

export class SpeakerSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SpeakerSystem';
    this.speakerMeshes = [];
    this.supportMeshes = [];
    this.indicatorLights = [];
    this.buildSpeakers();
  }

  buildSpeakers() {
    const cabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0x101318,
      roughness: 0.46,
      metalness: 0.12
    });
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: 0x303842,
      roughness: 0.5,
      emissive: 0x162f33,
      emissiveIntensity: 0.1
    });
    const grilleMaterial = new THREE.MeshStandardMaterial({
      color: 0x06080b,
      roughness: 0.58,
      metalness: 0.28
    });
    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x202631,
      roughness: 0.42,
      metalness: 0.32
    });
    const indicatorMaterial = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      roughness: 0.28,
      emissive: 0x0e7490,
      emissiveIntensity: 0.35
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.38,
      metalness: 0.45
    });
    const portMaterial = new THREE.MeshStandardMaterial({
      color: 0x030508,
      roughness: 0.62,
      metalness: 0.12
    });
    const cabinetGeometry = new THREE.BoxGeometry(1.45, 1.1, 1);
    const grilleFrameGeometry = new THREE.BoxGeometry(1.3, 0.94, 0.04);
    const grilleGeometry = new THREE.BoxGeometry(1.16, 0.8, 0.035);
    const grilleSlatGeometry = new THREE.BoxGeometry(1.02, 0.018, 0.018);
    const grilleVerticalGeometry = new THREE.BoxGeometry(0.018, 0.7, 0.018);
    const coneRecessGeometry = new THREE.CylinderGeometry(0.37, 0.37, 0.035, 32);
    const coneGeometry = new THREE.CylinderGeometry(0.2, 0.34, 0.12, 32);
    const coneCapGeometry = new THREE.CylinderGeometry(0.09, 0.13, 0.04, 24);
    const tweeterGeometry = new THREE.CylinderGeometry(0.1, 0.18, 0.08, 24);
    const seamGeometry = new THREE.BoxGeometry(1.28, 0.035, 0.035);
    const sideTrimGeometry = new THREE.BoxGeometry(0.055, 0.98, 0.04);
    const topTrimGeometry = new THREE.BoxGeometry(1.34, 0.055, 0.04);
    const portGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.035, 18);
    const indicatorGeometry = new THREE.SphereGeometry(0.055, 10, 8);
    const uprightGeometry = new THREE.BoxGeometry(0.12, 4.25, 0.12);
    const crossGeometry = new THREE.BoxGeometry(1.75, 0.08, 0.1);
    const subGeometry = new THREE.BoxGeometry(2.05, 0.72, 1.25);

    [-9.4, 9.4].forEach((x) => {
      const sideSupport = new THREE.Group();
      sideSupport.position.set(x, WORLD.stageHeight + 2.32, -15.55);
      [-0.82, 0.82].forEach((offset) => {
        const upright = new THREE.Mesh(uprightGeometry, supportMaterial);
        upright.position.set(offset, 0, -0.06);
        upright.castShadow = true;
        sideSupport.add(upright);
      });
      for (let brace = 0; brace < 3; brace += 1) {
        const cross = new THREE.Mesh(crossGeometry, supportMaterial);
        cross.position.set(0, -1.55 + brace * 1.42, -0.08);
        cross.rotation.z = brace % 2 === 0 ? 0.18 : -0.18;
        cross.castShadow = true;
        sideSupport.add(cross);
      }
      this.supportMeshes.push(sideSupport);
      this.group.add(sideSupport);

      for (let stack = 0; stack < 3; stack += 1) {
        const speaker = new THREE.Group();
        speaker.position.set(x, WORLD.stageHeight + 1.15 + stack * 1.25, -15.4);

        // Visible grilles/cones are on local +Z, matching the panner cone direction.
        const cabinet = new THREE.Mesh(cabinetGeometry, cabinetMaterial);
        cabinet.castShadow = true;
        cabinet.receiveShadow = true;

        const grilleFrame = new THREE.Mesh(grilleFrameGeometry, trimMaterial);
        grilleFrame.position.z = 0.515;

        const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
        grille.position.z = 0.545;

        const sideTrimLeft = new THREE.Mesh(sideTrimGeometry, trimMaterial);
        sideTrimLeft.position.set(-0.67, 0, 0.575);

        const sideTrimRight = sideTrimLeft.clone();
        sideTrimRight.position.x = 0.67;

        const topTrim = new THREE.Mesh(topTrimGeometry, trimMaterial);
        topTrim.position.set(0, 0.5, 0.575);

        const bottomTrim = topTrim.clone();
        bottomTrim.position.y = -0.5;

        const slats = new THREE.Group();
        [-0.3, -0.15, 0, 0.15, 0.3].forEach((y) => {
          const slat = new THREE.Mesh(grilleSlatGeometry, trimMaterial);
          slat.position.set(0, y, 0.585);
          slats.add(slat);
        });
        [-0.32, 0, 0.32].forEach((offset) => {
          const slat = new THREE.Mesh(grilleVerticalGeometry, trimMaterial);
          slat.position.set(offset, 0, 0.59);
          slats.add(slat);
        });

        const lowerRecess = new THREE.Mesh(coneRecessGeometry, portMaterial);
        lowerRecess.rotation.x = Math.PI / 2;
        lowerRecess.position.set(0, -0.22, 0.575);

        const lowerCone = new THREE.Mesh(coneGeometry, coneMaterial);
        lowerCone.rotation.x = Math.PI / 2;
        lowerCone.position.set(0, -0.22, 0.61);

        const lowerCap = new THREE.Mesh(coneCapGeometry, trimMaterial);
        lowerCap.rotation.x = Math.PI / 2;
        lowerCap.position.set(0, -0.22, 0.685);

        const upperRecess = lowerRecess.clone();
        upperRecess.position.y = 0.22;

        const upperCone = lowerCone.clone();
        upperCone.position.y = 0.22;

        const upperCap = lowerCap.clone();
        upperCap.position.y = 0.22;

        const tweeter = new THREE.Mesh(tweeterGeometry, coneMaterial);
        tweeter.rotation.x = Math.PI / 2;
        tweeter.position.set(0.43, 0.34, 0.63);

        const bassPort = new THREE.Mesh(portGeometry, portMaterial);
        bassPort.rotation.x = Math.PI / 2;
        bassPort.position.set(-0.45, -0.38, 0.6);

        const seam = new THREE.Mesh(seamGeometry, supportMaterial);
        seam.position.set(0, 0, 0.615);

        const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        indicator.position.set(-0.54, 0.38, 0.59);
        this.indicatorLights.push(indicator);

        speaker.add(
          cabinet,
          grilleFrame,
          grille,
          sideTrimLeft,
          sideTrimRight,
          topTrim,
          bottomTrim,
          slats,
          lowerRecess,
          lowerCone,
          lowerCap,
          upperRecess,
          upperCone,
          upperCap,
          tweeter,
          bassPort,
          seam,
          indicator
        );
        this.group.add(speaker);
        this.speakerMeshes.push(speaker);
      }

      const sub = new THREE.Mesh(subGeometry, cabinetMaterial);
      sub.position.set(x, WORLD.stageHeight + 0.36, -15.45);
      sub.castShadow = true;
      sub.receiveShadow = true;
      this.supportMeshes.push(sub);
      this.group.add(sub);
    });
  }

  getAudioAnchors() {
    return this.speakerMeshes.filter((_, index) => index % 3 === 1);
  }

  getCollisionBoxes() {
    return [-9.4, 9.4].map((x) => ({
      id: `speaker-stack-${x}`,
      name: x < 0 ? 'Left stack' : 'Right stack',
      type: 'speaker',
      centerX: x,
      centerY: WORLD.stageHeight + 2.4,
      centerZ: -15.4,
      width: 2.2,
      height: 4.3,
      depth: 1.8
    }));
  }

  getVisibilityTargets() {
    return [-9.4, 9.4].map((x) => ({
      id: `speaker-stack-${x}`,
      boxIds: [`speaker-stack-${x}`],
      objects: [
        ...this.speakerMeshes.filter((speaker) => Math.sign(speaker.position.x) === Math.sign(x)),
        ...this.supportMeshes.filter((mesh) => Math.sign(mesh.position.x) === Math.sign(x))
      ]
    }));
  }

  update(time) {
    this.indicatorLights.forEach((light, index) => {
      light.material.emissiveIntensity = 0.2 + (Math.sin(time * 1.4 + index * 0.7) + 1) * 0.18;
    });
  }

  pulse(score) {
    const normalizedScore = Math.max(0, Math.min(1, Number(score) || 0));
    this.speakerMeshes.forEach((speaker, index) => {
      const scale = 1 + Math.sin(performance.now() * 0.012 + index) * normalizedScore * 0.04;
      speaker.scale.setScalar(scale);
    });
  }
}

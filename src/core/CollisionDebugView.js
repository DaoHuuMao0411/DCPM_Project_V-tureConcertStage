import * as THREE from 'three';

export class CollisionDebugView {
  constructor(scene, collisionManager) {
    this.scene = scene;
    this.collisionManager = collisionManager;
    this.group = new THREE.Group();
    this.group.name = 'CollisionDebugView';
    this.group.visible = false;
    this.meshes = [];
    this.version = -1;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.42,
      wireframe: true,
      depthWrite: false
    });

    this.scene.add(this.group);
    this.sync();
  }

  setVisible(isVisible) {
    this.group.visible = isVisible;
    if (isVisible && this.version !== this.collisionManager.version) {
      this.sync();
    }
  }

  toggle() {
    this.setVisible(!this.group.visible);
    return this.group.visible;
  }

  isVisible() {
    return this.group.visible;
  }

  update() {
    if (this.group.visible && this.version !== this.collisionManager.version) {
      this.sync();
    }
  }

  sync() {
    this.group.clear();
    this.meshes = this.collisionManager.getBoxes().map((box) => {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = `CollisionBox:${box.id ?? 'unnamed'}`;
      mesh.position.set(
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2
      );
      mesh.scale.set(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
    this.version = this.collisionManager.version;
  }
}

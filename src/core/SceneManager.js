import * as THREE from 'three';
import { getCappedPixelRatio } from './PerformanceDiagnostics.js';

export class SceneManager {
  constructor(root) {
    this.root = root;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b12);
    this.scene.fog = new THREE.FogExp2(0x090b12, 0.018);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 250);
    this.camera.position.set(0, 4, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(getCappedPixelRatio(window));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'viewport';
    this.renderer.domElement.tabIndex = 0;

    this.clock = new THREE.Clock();
    this.root.appendChild(this.renderer.domElement);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  getDeltaTime() {
    return Math.min(this.clock.getDelta(), 0.05);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(getCappedPixelRatio(window));
    this.renderer.setSize(width, height);
  }
}

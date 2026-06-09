import * as THREE from 'three';

export class BigScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.context = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.songTitle = 'No track selected';
    this.audioImage = {
      url: '',
      label: 'No track selected',
      source: 'placeholder'
    };
    this.loadedImage = null;
    this.imageLoadToken = 0;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(13.4, 6.7),
      new THREE.MeshStandardMaterial({
        map: this.texture,
        emissive: 0xffffff,
        emissiveMap: this.texture,
        emissiveIntensity: 0.9,
        roughness: 0.3
      })
    );
    screen.position.set(0, 5, -23.42);
    this.screenMesh = screen;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(14.2, 7.4, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.45, metalness: 0.2 })
    );
    frame.position.set(0, 5, -23.55);
    this.frameMesh = frame;

    this.group = new THREE.Group();
    this.group.name = 'BigScreen';
    this.group.add(frame, screen);
    this.drawImageOnly();
  }

  setSongTitle(title) {
    this.songTitle = title || 'Local Track';
  }

  setAudioImage(imageInfo = {}) {
    const nextImage = {
      url: imageInfo.url || '',
      label: imageInfo.label || this.songTitle || 'Local Track',
      source: imageInfo.source || (imageInfo.url ? 'matched' : 'placeholder')
    };
    this.audioImage = nextImage;
    this.loadedImage = null;
    this.imageLoadToken += 1;

    if (!nextImage.url || typeof Image === 'undefined') {
      this.drawImageOnly();
      return;
    }

    const token = this.imageLoadToken;
    const image = new Image();
    image.onload = () => {
      if (token !== this.imageLoadToken) {
        return;
      }

      this.loadedImage = image;
      this.drawImageOnly();
    };
    image.onerror = () => {
      if (token !== this.imageLoadToken) {
        return;
      }

      this.loadedImage = null;
      this.audioImage = {
        ...this.audioImage,
        source: 'placeholder'
      };
      this.drawImageOnly();
    };
    image.src = nextImage.url;
  }

  getAudioImageStatus() {
    return { ...this.audioImage, hasImage: Boolean(this.loadedImage) };
  }

  getCollisionBoxes() {
    return [
      // Intentionally wider than the visible screen: this acts as the rear
      // stage/screen blocker for camera, avatar visibility, and audio occlusion.
      {
        id: 'big-screen-wall',
        name: 'Big screen',
        type: 'screen',
        centerX: 0,
        centerY: 4.1,
        centerZ: -23.6,
        width: 24.8,
        height: 8.4,
        depth: 1.3
      }
    ];
  }

  getVisibilityTargets() {
    return [
      {
        id: 'big-screen-wall',
        boxIds: ['big-screen-wall'],
        objects: [this.frameMesh, this.screenMesh]
      }
    ];
  }

  update() {
    this.drawImageOnly();
  }

  drawImageOnly() {
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (this.loadedImage) {
      drawCoverImage(ctx, this.loadedImage, width, height);
    } else {
      this.drawPlaceholderBackground();
    }

    this.texture.needsUpdate = true;
  }

  drawPlaceholderBackground() {
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(54, 54, width - 108, height - 108);

    ctx.fillStyle = '#d1d5db';
    ctx.textAlign = 'center';
    ctx.font = '700 46px sans-serif';
    ctx.fillText('No image available', width / 2, height / 2 - 14);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '26px sans-serif';
    ctx.fillText('Add matching artwork in assets/image', width / 2, height / 2 + 34);
  }
}

function drawCoverImage(ctx, image, width, height) {
  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;
  const drawHeight = imageRatio > canvasRatio ? height : width / imageRatio;
  const drawWidth = imageRatio > canvasRatio ? height * imageRatio : width;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

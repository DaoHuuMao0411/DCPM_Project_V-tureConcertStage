export class InputManager {
  constructor(target, options = {}) {
    this.target = target;
    this.window = options.windowRef ?? window;
    this.document = options.documentRef ?? document;
    this.keys = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    this.isPointerLocked = false;
    this.isDragging = false;
    this.lastDragPosition = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this);

    this.window.addEventListener('keydown', this.handleKeyDown);
    this.window.addEventListener('keyup', this.handleKeyUp);
    this.window.addEventListener('mouseup', this.handleMouseUp);
    this.target.addEventListener('mousedown', this.handleMouseDown);
    this.target.addEventListener('wheel', this.handleWheel, { passive: false });
    this.document.addEventListener('mousemove', this.handleMouseMove);
    this.document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  requestPointerLock() {
    if (this.document.pointerLockElement !== this.target) {
      this.target.requestPointerLock?.();
    }
  }

  exitPointerLock() {
    if (this.document.pointerLockElement === this.target) {
      this.document.exitPointerLock?.();
    }
  }

  togglePointerLock() {
    if (this.document.pointerLockElement === this.target) {
      this.exitPointerLock();
      return;
    }

    this.requestPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consumeMouseDelta() {
    const delta = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  consumeWheelDelta() {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }

  dispose() {
    this.window.removeEventListener('keydown', this.handleKeyDown);
    this.window.removeEventListener('keyup', this.handleKeyUp);
    this.window.removeEventListener('mouseup', this.handleMouseUp);
    this.target.removeEventListener('mousedown', this.handleMouseDown);
    this.target.removeEventListener('wheel', this.handleWheel);
    this.document.removeEventListener('mousemove', this.handleMouseMove);
    this.document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  handleKeyDown(event) {
    this.keys.add(event.code);

    if ((event.code === 'AltLeft' || event.code === 'AltRight') && !event.repeat) {
      event.preventDefault?.();
      this.togglePointerLock();
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  handleMouseDown(event) {
    if (event.button !== 0 || this.isPointerLocked) {
      return;
    }

    this.isDragging = true;
    this.lastDragPosition = getClientPosition(event);
    this.target.focus?.();
    event.preventDefault?.();
  }

  handleMouseUp(event) {
    if (!this.isDragging) {
      return;
    }

    if (event.button === 0 || event.buttons === 0 || event.button == null) {
      this.stopDragging();
    }
  }

  handleMouseMove(event) {
    if (!this.isPointerLocked && !this.isDragging) {
      return;
    }

    const movement = this.getMouseMovement(event);
    this.mouseDelta.x += movement.x;
    this.mouseDelta.y += movement.y;
  }

  handleWheel(event) {
    this.wheelDelta += normalizeWheelDelta(event, this.window);
    event.preventDefault?.();
  }

  handlePointerLockChange() {
    this.isPointerLocked = this.document.pointerLockElement === this.target;
    this.stopDragging();
  }

  getMouseMovement(event) {
    const movementX = Number(event.movementX);
    const movementY = Number(event.movementY);

    if (Number.isFinite(movementX) && Number.isFinite(movementY) && (movementX !== 0 || movementY !== 0)) {
      this.lastDragPosition = getClientPosition(event);
      return { x: movementX, y: movementY };
    }

    const nextPosition = getClientPosition(event);
    if (!nextPosition || !this.lastDragPosition) {
      this.lastDragPosition = nextPosition;
      return { x: 0, y: 0 };
    }

    const movement = {
      x: nextPosition.x - this.lastDragPosition.x,
      y: nextPosition.y - this.lastDragPosition.y
    };
    this.lastDragPosition = nextPosition;
    return movement;
  }

  stopDragging() {
    this.isDragging = false;
    this.lastDragPosition = null;
  }
}

function getClientPosition(event) {
  const x = Number(event.clientX);
  const y = Number(event.clientY);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function normalizeWheelDelta(event, windowRef) {
  const deltaY = Number(event.deltaY);
  if (!Number.isFinite(deltaY)) {
    return 0;
  }

  if (event.deltaMode === 1) {
    return deltaY * 16;
  }

  if (event.deltaMode === 2) {
    return deltaY * (windowRef?.innerHeight || 800);
  }

  return deltaY;
}

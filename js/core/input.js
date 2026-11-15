// Keyboard + mouse input with Pointer Lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.lmb = false; this.rmb = false;
    this.lmbJust = false; this.rmbJust = false;
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.onLockChange = null;
    this.sensitivity = 1;
    this.invertY = false;

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k); this.justPressed.add(k);
      if (this.enabled && ['Tab', 'Space', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'ControlLeft'].includes(k)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.enabled) return;
      if (e.button === 0) { this.lmb = true; this.lmbJust = true; }
      if (e.button === 2) { this.rmb = true; this.rmbJust = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.lmb = this.rmb = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (!this.locked) {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        const q = this.canvas.requestPointerLock();
        if (q && q.catch) q.catch(() => {});
      });
    }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  get moveX() { return (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0); }
  get moveZ() { return (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0); }

  endFrame() {
    this.justPressed.clear();
    this.mouseDX = 0; this.mouseDY = 0;
    this.lmbJust = false; this.rmbJust = false;
    this.wheel = 0;
  }
}
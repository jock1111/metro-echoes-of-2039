// Renderer / scene / camera / quality management.
import * as THREE from 'three';
import { PostFX } from './post.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030405);
    this.scene.fog = new THREE.FogExp2(0x040608, 0.035);

    // faint ambient so geometry reads in the dark
    const hemi = new THREE.HemisphereLight(0x2c3644, 0x05070a, 0.3);
    this.scene.add(hemi);

    // tiny procedural environment map: gives metal & wet surfaces something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x05070a);
    const envPanel = (color, k, x, y, z, w, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    envPanel(0xffd9a0, 4, 0, 5, 0, 4, 4);    // warm ceiling glow
    envPanel(0x8fb8d8, 1.5, -5, 2, 0, 3, 3); // cool side fill
    envPanel(0x3a4a5a, 1, 5, 1, 2, 3, 3);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 120);
    this.camera.rotation.order = 'YXZ';

    this.post = new PostFX(this.renderer, this.scene, this.camera);

    this.quality = 'medium';
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    addEventListener('resize', () => this._resize());
    this._resize();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') {
      this.renderer.setPixelRatio(Math.min(dpr, 1));
      this.renderer.shadowMap.enabled = false;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
    }
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow) {
        const size = o._shadowSize || (q === 'high' ? 2048 : 1024);
        if (o.shadow.mapSize.x !== size) {
          o.shadow.mapSize.set(size, size);
          if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
        }
      }
      if (o.isMesh && o.material) o.material.needsUpdate = true;
    });
    this.post.setQuality(q);
    this._resize();
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
  }

  render() { this.post.render(); }
}
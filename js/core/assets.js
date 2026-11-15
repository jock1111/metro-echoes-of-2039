// Asset pipeline: locally shipped glTF models + PBR texture sets + rigged characters
// (CC0, see assets/ATTRIBUTION.md). Everything is optional at runtime — callers fall back to
// procedural assets when a key is absent.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';

// Deep-clone a rigged glTF scene. SkinnedMesh.clone() shares the source skeleton, so the clone's
// bones must be remapped to its own copied nodes and the skeleton rebound — otherwise every
// instance would drive the original's bones. Verified against a 49-bone Mixamo rig.
export function cloneRig(src) {
  try {
    const clone = src.clone(true);
    const srcNodes = []; src.traverse(o => srcNodes.push(o));
    const cloneNodes = []; clone.traverse(o => cloneNodes.push(o));
    if (srcNodes.length !== cloneNodes.length) throw new Error('clone hierarchy mismatch');
    const byUuid = new Map(srcNodes.map((o, i) => [o.uuid, cloneNodes[i]]));
    // Validate every binding first: an external/missing bone must never fall back to the template.
    const bindings = srcNodes.filter(o => o.isSkinnedMesh).map(o => {
      const s = o.skeleton;
      if (!s || !s.bones.length || s.boneInverses.length !== s.bones.length) {
        throw new Error(`invalid skeleton on ${o.name || 'mesh'}`);
      }
      const bones = s.bones.map(b => {
        const copy = b && byUuid.get(b.uuid);
        if (!copy?.isBone || copy === b) throw new Error(`missing cloned bone: ${b?.name || 'unnamed'}`);
        return copy;
      });
      const inverses = s.boneInverses.map(m => {
        if (!m?.isMatrix4 || !m.elements.every(Number.isFinite)) throw new Error('invalid bone inverse');
        return m.clone();
      });
      return { mesh: byUuid.get(o.uuid), bones, inverses, bindMatrix: o.bindMatrix };
    });
    for (const b of bindings) b.mesh.bind(new THREE.Skeleton(b.bones, b.inverses), b.bindMatrix);
    return clone;
  } catch (err) {
    console.warn(`[character rig] clone rejected: ${err.message}`);
    return null;
  }
}

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.manifest = null;
    this.sets = {};      // name -> { diff, nor, rough } THREE.Texture
    this.models = {};    // name -> gltf scene (template, clone per use)
    this.characters = {}; // name -> { scene, animations, meta } rigged character templates
    this._matCache = new Map();
  }

  async load(onProgress = () => {}) {
    let manifest;
    try {
      const r = await fetch('assets/manifest.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      manifest = await r.json();
    } catch (err) {
      console.warn(`[assets] manifest unavailable: ${err.message}`);
      return;
    }
    this.manifest = manifest;

    const texNames = Object.keys(manifest.textures || {});
    const modelNames = Object.keys(manifest.models || {});
    const charNames = Object.keys(manifest.characters || {});
    const total = texNames.length + modelNames.length + charNames.length;
    let done = 0;
    const tick = () => onProgress(++done / Math.max(1, total));

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const tl = new THREE.TextureLoader();
    const prep = (t, srgb) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      return t;
    };
    const gl = new GLTFLoader();
    const texP = Promise.all(texNames.map(async (name) => {
      const e = manifest.textures[name];
      try {
        const [diff, nor, rough] = await Promise.all([
          tl.loadAsync('assets/' + e.diff), tl.loadAsync('assets/' + e.nor), tl.loadAsync('assets/' + e.rough),
        ]);
        this.sets[name] = { diff: prep(diff, true), nor: prep(nor, false), rough: prep(rough, false) };
      } catch (err) { console.warn('asset texture failed:', name, err); }
      tick();
    }));

    const modelP = Promise.all(modelNames.map(async (name) => {
      try {
        const gltf = await gl.loadAsync('assets/' + manifest.models[name].gltf);
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.45;
          }
        });
        this.models[name] = gltf.scene;
      } catch (err) { console.warn('asset model failed:', name, err); }
      tick();
    }));

    // Rigged characters: keep the template scene + clips; cloneRig() makes independent instances.
    const charP = Promise.all(charNames.map(async (name) => {
      const e = manifest.characters[name];
      try {
        const gltf = await gl.loadAsync('assets/' + e.gltf);
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.frustumCulled = false; // skinned bounds shift with animation
            if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.45;
          }
        });
        this.characters[name] = { scene: gltf.scene, animations: gltf.animations || [], meta: e };
      } catch (err) { console.warn(`[character:${name}] load failed: ${err.message || 'unavailable'}`); }
      tick();
    }));
    await Promise.all([texP, modelP, charP]);
  }

  hasSet(name) { return !!this.sets[name]; }
  hasModel(name) { return !!this.models[name]; }
  hasCharacter(name) { return !!this.characters[name]; }

  // Gameplay owns the outer Group. Normalization/orientation live on a separate visual parent;
  // the cloned source scene keeps its authored transforms and is the native mixer's root.
  character(name, { height = null } = {}) {
    const src = this.characters[name];
    if (!src) {
      console.warn(`[character:${name}] unavailable; using procedural fallback`);
      return null;
    }
    try {
      const scene = cloneRig(src.scene);
      if (!scene) return null;
      const meta = src.meta || {};
      const rotationY = meta.rotationY ?? 0; // radians, relative to authored orientation
      if (!Number.isFinite(rotationY) || (height !== null && (!Number.isFinite(height) || height <= 0))) {
        throw new Error('invalid height/orientation');
      }
      const g = new THREE.Group();
      g.name = `${name}_gameplay`;
      const visual = new THREE.Group();
      visual.rotation.y = rotationY;
      visual.add(scene);
      g.add(visual);
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(visual, true);
      const h = box.max.y - box.min.y;
      if (box.isEmpty() || ![...box.min, ...box.max].every(Number.isFinite) || h <= 0) {
        throw new Error('empty or invalid character bounds');
      }
      if (height !== null) visual.scale.setScalar(height / h);
      g.updateMatrixWorld(true);
      box.setFromObject(visual, true);
      visual.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      g.updateMatrixWorld(true);

      const clips = Object.create(null);
      for (const a of src.animations || []) clips[a.name] = a;
      // Unnamed glTF nodes can have UUID-targeted tracks. Preserve their clone correspondence.
      const sourceNodes = []; src.scene.traverse(o => sourceNodes.push(o));
      const copiedNodes = []; scene.traverse(o => copiedNodes.push(o));
      g.userData.sourceNodeUUIDs = Object.fromEntries(sourceNodes.map((o, i) => [o.uuid, copiedNodes[i].uuid]));
      g.userData.visual = visual;
      g.userData.animationRoot = scene;
      g.userData.glTFClips = clips;
      g.userData.characterMeta = meta;
      g.userData.isGLBCharacter = true;
      return g;
    } catch (err) {
      console.warn(`[character:${name}] instance rejected: ${err.message}`);
      return null;
    }
  }

  // Cached MeshStandardMaterial from a PBR set. repeat: [x, y]; extra props merged.
  pbr(name, repeat = [1, 1], extra = {}) {
    const set = this.sets[name];
    if (!set) return null;
    const key = name + '|' + repeat.join(',') + '|' + JSON.stringify(extra);
    if (this._matCache.has(key)) return this._matCache.get(key);
    const clone = (t) => {
      const c = t.clone();
      c.repeat.set(repeat[0], repeat[1]);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({
      map: clone(set.diff), normalMap: clone(set.nor), roughnessMap: clone(set.rough),
      roughness: 1, metalness: 0, ...extra,
    });
    m.normalScale.set(1, 1);
    this._matCache.set(key, m);
    return m;
  }

  // Clone of a loaded model, optionally rescaled to a target height (meters).
  model(name, { height = null, scale = 1 } = {}) {
    const src = this.models[name];
    if (!src) return null;
    const g = src.clone();
    if (height) {
      const box = new THREE.Box3().setFromObject(src);
      const h = box.max.y - box.min.y;
      if (h > 0) scale = height / h;
    }
    g.scale.setScalar(scale);
    return g;
  }
}
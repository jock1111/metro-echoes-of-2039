// Self-contained post-processing: depth-based SSAO + subtle bloom + correct sRGB output.
// No external dependencies beyond the vendored three.module.js. Falls back to direct
// rendering when disabled (low quality) or when the required GPU features are missing.
import * as THREE from 'three';

const QUAD_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Reconstruct view-space position from the depth buffer.
const DEPTH_GLSL = /* glsl */`
  uniform sampler2D tDepth;
  uniform float uNear, uFar, uTanX, uTanY;
  float linearDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (2.0 * uNear * uFar) / (uFar + uNear - (2.0 * d - 1.0) * (uFar - uNear));
  }
  vec3 viewPos(vec2 uv) {
    float z = linearDepth(uv);
    vec2 ndc = uv * 2.0 - 1.0;
    return vec3(ndc.x * uTanX, ndc.y * uTanY, -1.0) * z;
  }
`;

const AO_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  ${DEPTH_GLSL}
  uniform vec2 uResolution;
  uniform float uRadius, uIntensity, uBias;
  uniform int uSamples;
  const vec2 POISSON[12] = vec2[12](
    vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
    vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
    vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
    vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
  );
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float z = linearDepth(vUv);
    // skip the far background (depth ~ far) — nothing to occlude there
    if (z > uFar * 0.985) { gl_FragColor = vec4(1.0); return; }
    vec3 p = viewPos(vUv);
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));
    if (dot(n, -p) < 0.0) n = -n;
    float ang = hash(vUv * uResolution) * 6.2831;
    float ca = cos(ang), sa = sin(ang);
    mat2 rot = mat2(ca, -sa, sa, ca);
    vec2 scale = vec2(uRadius / (z * uTanX), uRadius / (z * uTanY)) * 0.5;
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uSamples) break;
      vec2 off = rot * POISSON[i] * scale;
      vec3 sp = viewPos(vUv + off);
      vec3 diff = sp - p;
      float dist = length(diff);
      float facing = max(0.0, dot(n, diff / max(dist, 1e-4)) - uBias);
      float range = smoothstep(0.0, 1.0, uRadius / max(dist, 1e-4));
      occ += facing * range;
    }
    occ = clamp(occ / float(uSamples) * uIntensity, 0.0, 1.0);
    gl_FragColor = vec4(vec3(1.0 - occ), 1.0);
  }
`;

const BRIGHT_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform float uThreshold;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    float br = max(c.r, max(c.g, c.b));
    float contrib = max(0.0, br - uThreshold) / max(br, 1e-4);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

const BLUR_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform vec2 uDirection; // texel-sized step
  void main() {
    vec3 sum = texture2D(tInput, vUv).rgb * 0.227027;
    vec2 o1 = uDirection * 1.3846154;
    vec2 o2 = uDirection * 3.2307692;
    sum += (texture2D(tInput, vUv + o1).rgb + texture2D(tInput, vUv - o1).rgb) * 0.3162162;
    sum += (texture2D(tInput, vUv + o2).rgb + texture2D(tInput, vUv - o2).rgb) * 0.0702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FS = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene, tAO, tBloom;
  uniform float uAOStrength, uBloomStrength, uExposure;
  // ACES filmic fit — identical to three.js ACESFilmicToneMapping so the
  // post path and the direct-render fallback produce the same image
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 IN = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    color *= uExposure / 0.6;
    color = IN * color;
    color = RRTAndODTFit(color);
    color = OUT * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 lin2srgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 color = texture2D(tScene, vUv).rgb;
    float ao = texture2D(tAO, vUv).r;
    color *= mix(1.0, ao, uAOStrength);
    color += texture2D(tBloom, vUv).rgb * uBloomStrength;
    gl_FragColor = vec4(lin2srgb(aces(color)), 1.0);
  }
`;

function makePass(fs, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VS, fragmentShader: fs, uniforms,
    depthTest: false, depthWrite: false,
    // passes own their color pipeline — keep three's tone-mapping chunks out
    toneMapped: false,
  });
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.ok = false;
    this.enabled = false;
    this.quality = 'low';
    this.time = 0;
    this._size = new THREE.Vector2(1, 1);
    try { this._init(); } catch (e) { console.warn('PostFX disabled:', e); this.ok = false; }
  }

  _init() {
    const r = this.renderer;
    this.hdr = !!r.extensions.get('EXT_color_buffer_float');
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    const mkTarget = (w, h, withDepth) => {
      const t = new THREE.WebGLRenderTarget(w, h, {
        type, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: withDepth, stencilBuffer: false,
      });
      t.texture.colorSpace = THREE.LinearSRGBColorSpace;
      if (withDepth) {
        t.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
        t.depthTexture.format = THREE.DepthFormat;
      }
      return t;
    };
    this.sceneTarget = mkTarget(2, 2, true);
    this.aoTarget = mkTarget(2, 2, false);
    this.brightTarget = mkTarget(2, 2, false);
    this.blurA = mkTarget(2, 2, false);
    this.blurB = mkTarget(2, 2, false);

    // fullscreen quad
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const depthUniforms = () => ({
      tDepth: { value: this.sceneTarget.depthTexture },
      uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
      uTanX: { value: 1 }, uTanY: { value: 1 },
    });
    this.aoMat = makePass(AO_FS, {
      ...depthUniforms(),
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 0.55 }, uIntensity: { value: 1.1 }, uBias: { value: 0.025 },
      uSamples: { value: 8 },
    });
    this.brightMat = makePass(BRIGHT_FS, {
      tScene: { value: this.sceneTarget.texture }, uThreshold: { value: this.hdr ? 0.85 : 0.72 },
    });
    this.blurMat = makePass(BLUR_FS, {
      tInput: { value: null }, uDirection: { value: new THREE.Vector2() },
    });
    this.compMat = makePass(COMPOSITE_FS, {
      tScene: { value: this.sceneTarget.texture },
      tAO: { value: this.aoTarget.texture },
      tBloom: { value: this.blurB.texture },
      uAOStrength: { value: 0.7 }, uBloomStrength: { value: 0.35 }, uExposure: { value: 1.15 },
    });
    this.ok = true;
    this._checked = false;
  }

  setQuality(q) {
    this.quality = q;
    this.enabled = this.ok && q !== 'low';
    if (this.aoMat) this.aoMat.uniforms.uSamples.value = q === 'high' ? 12 : 6;
    this._resize();
  }

  setSize(w, h) { this._size.set(w, h); this._resize(); }

  _resize() {
    if (!this.ok) return;
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(this._size.x * pr));
    const h = Math.max(2, Math.floor(this._size.y * pr));
    this.sceneTarget.setSize(w, h);
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    this.aoTarget.setSize(hw, hh);
    this.brightTarget.setSize(hw, hh);
    this.blurA.setSize(hw, hh);
    this.blurB.setSize(hw, hh);
    const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanX = tanY * this.camera.aspect;
    for (const m of [this.aoMat]) {
      m.uniforms.uTanX.value = tanX; m.uniforms.uTanY.value = tanY;
      m.uniforms.uNear.value = this.camera.near; m.uniforms.uFar.value = this.camera.far;
      m.uniforms.uResolution.value.set(hw, hh);
    }
    this._halfTexel = new THREE.Vector2(1 / hw, 1 / hh);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(dt = 0) {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    this.time += dt;
    const r = this.renderer;
    const prevAutoClear = r.autoClear;
    r.autoClear = true;
    this.compMat.uniforms.uExposure.value = r.toneMappingExposure;

    try {
      // 1. scene → HDR target (linear, no tone mapping — composite handles it)
      r.setRenderTarget(this.sceneTarget);
      r.render(this.scene, this.camera);

      // keep AO projection in sync with ADS fov changes
      const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      this.aoMat.uniforms.uTanY.value = tanY;
      this.aoMat.uniforms.uTanX.value = tanY * this.camera.aspect;

      // 2. SSAO (half res)
      this._pass(this.aoMat, this.aoTarget);

      // 3. bloom: bright pass + separable blur (half res)
      this._pass(this.brightMat, this.brightTarget);
      this.blurMat.uniforms.tInput.value = this.brightTarget.texture;
      this.blurMat.uniforms.uDirection.value.set(this._halfTexel.x, 0);
      this._pass(this.blurMat, this.blurA);
      this.blurMat.uniforms.tInput.value = this.blurA.texture;
      this.blurMat.uniforms.uDirection.value.set(0, this._halfTexel.y);
      this._pass(this.blurMat, this.blurB);

      // 4. composite → screen
      this._pass(this.compMat, null);
    } catch (e) {
      console.warn('PostFX render failed, falling back to direct rendering:', e);
      this.ok = false; this.enabled = false;
    }
    r.setRenderTarget(null);
    r.autoClear = prevAutoClear;

    // one-time shader health check: a failed compile/link would render black —
    // detect it and permanently fall back to direct rendering
    if (!this._checked) {
      this._checked = true;
      for (const p of r.info.programs) {
        if (p.diagnostics) {
          console.warn('PostFX shader failed, falling back to direct rendering:', p.diagnostics);
          this.ok = false; this.enabled = false;
          break;
        }
      }
    }
  }

  dispose() {
    if (!this.ok) return;
    for (const t of [this.sceneTarget, this.aoTarget, this.brightTarget, this.blurA, this.blurB]) t.dispose();
    for (const m of [this.aoMat, this.brightMat, this.blurMat, this.compMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}
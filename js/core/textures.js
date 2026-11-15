// Procedural canvas textures — no external assets.
import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, n, alpha, dark = true) {
  for (let i = 0; i < n; i++) {
    const v = dark ? Math.random() * 60 : 120 + Math.random() * 135;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * Math.random()})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

function stains(ctx, w, h, n, color, maxR = 60) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function cracks(ctx, w, h, n, color = 'rgba(15,14,12,0.5)') {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + (Math.random() * 6 | 0);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.5) * 40; y += Math.random() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function rustStreaks(ctx, w, h, n) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h * 0.5, len = 30 + Math.random() * 120;
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, `rgba(${110 + Math.random() * 40 | 0},${55 + Math.random() * 20 | 0},25,${0.25 + Math.random() * 0.3})`);
    g.addColorStop(1, 'rgba(80,45,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2 + Math.random() * 5, len);
  }
}

export function concreteTexture(base = '#5a5a58', size = 512) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 9000, 0.16);
    speckle(ctx, w, h, 3000, 0.1, false);
    stains(ctx, w, h, 14, 'rgba(28,30,28,0.35)');
    stains(ctx, w, h, 6, 'rgba(70,72,66,0.25)');
    cracks(ctx, w, h, 8);
  });
}

export function tileTexture(size = 512) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#8f8d82'; ctx.fillRect(0, 0, w, h);
    const t = 64;
    for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) {
      const v = 130 + Math.random() * 35;
      ctx.fillStyle = `rgb(${v | 0},${v - 3 | 0},${v - 14 | 0})`;
      ctx.fillRect(x + 2, y + 2, t - 4, t - 4);
      const g = ctx.createLinearGradient(x, y, x, y + t);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g; ctx.fillRect(x + 2, y + 2, t - 4, t - 4);
    }
    ctx.strokeStyle = 'rgba(30,29,25,0.8)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += t) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += t) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    stains(ctx, w, h, 16, 'rgba(35,36,30,0.4)');
    stains(ctx, w, h, 5, 'rgba(60,50,35,0.3)');
    speckle(ctx, w, h, 2500, 0.12);
    // grime concentrated at bottom
    const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,20,16,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export function platformFloorTexture(size = 512) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#4c4c4e'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 12000, 0.2);
    speckle(ctx, w, h, 4000, 0.12, false);
    stains(ctx, w, h, 12, 'rgba(22,24,24,0.4)');
    // slab seams
    ctx.strokeStyle = 'rgba(18,18,18,0.7)'; ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  });
}

export function ballastTexture(size = 256) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#26262a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 30 + Math.random() * 55;
      ctx.fillStyle = `rgb(${v | 0},${v | 0},${v + 4 | 0})`;
      const r = 2 + Math.random() * 5;
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, r, 0, 7); ctx.fill();
    }
    stains(ctx, w, h, 8, 'rgba(10,10,12,0.5)');
  });
}

export function rustMetalTexture(base = '#4a4440', size = 512) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 6000, 0.15);
    rustStreaks(ctx, w, h, 40);
    stains(ctx, w, h, 16, 'rgba(96,54,26,0.4)', 45);
    stains(ctx, w, h, 8, 'rgba(20,18,16,0.45)');
    // panel seams + rivets
    ctx.strokeStyle = 'rgba(15,13,12,0.7)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(25,22,20,0.8)';
    for (let x = 8; x < w; x += 128) for (let y = 8; y < h; y += 24) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
  });
}

export function trainExteriorTexture(size = 512) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#3d5240'; ctx.fillRect(0, 0, w, h); // soviet green
    speckle(ctx, w, h, 5000, 0.12);
    // horizontal ribbing
    for (let y = 0; y < h; y += 42) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, y + 3, w, 2);
    }
    rustStreaks(ctx, w, h, 55);
    stains(ctx, w, h, 14, 'rgba(90,50,24,0.45)', 50);
    stains(ctx, w, h, 8, 'rgba(15,18,15,0.4)');
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(12,12,10,0.65)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export function woodTexture(size = 256) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#5d4a33'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      const v = Math.random() * 22;
      ctx.fillStyle = `rgb(${86 + v | 0},${66 + v * 0.7 | 0},${44 + v * 0.5 | 0})`;
      ctx.fillRect(0, y, w, 30);
      ctx.strokeStyle = 'rgba(30,22,14,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      // grain
      ctx.strokeStyle = 'rgba(45,33,20,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(0, y + 4 + Math.random() * 24);
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + 4 + Math.random() * 24);
        ctx.stroke();
      }
    }
    stains(ctx, w, h, 6, 'rgba(25,20,14,0.4)');
  });
}

export function metalPanelTexture(size = 256) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#3f464c'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 3500, 0.12);
    ctx.strokeStyle = 'rgba(14,16,18,0.8)'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    rustStreaks(ctx, w, h, 12);
    stains(ctx, w, h, 6, 'rgba(16,18,20,0.4)');
    ctx.fillStyle = 'rgba(20,22,24,0.9)';
    for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]]) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    }
  });
}

export function hazardTexture(size = 128) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#8a7a1e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#15130e';
    for (let i = -h; i < w + h; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 - h, h); ctx.lineTo(i - h, h); ctx.fill();
    }
    speckle(ctx, w, h, 800, 0.3);
    stains(ctx, w, h, 4, 'rgba(20,18,14,0.5)');
  });
}

export function ceilingTexture(size = 256) {
  return canvas(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#3a3a3c'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 5000, 0.15);
    stains(ctx, w, h, 10, 'rgba(18,20,20,0.45)');
    stains(ctx, w, h, 4, 'rgba(60,55,40,0.25)');
    ctx.strokeStyle = 'rgba(16,16,16,0.6)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 85) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  });
}

export function graffitiTexture(text, color = '#7a2a22', size = 512) {
  const t = canvas(size, size / 2, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `900 ${h * 0.42 | 0}px 'Arial Black', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.rotate(-0.04 + Math.random() * 0.08);
    // spray effect: multiple offset passes
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = color; ctx.globalAlpha = 0.16;
      ctx.fillText(text, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    ctx.globalAlpha = 0.85; ctx.fillText(text, 0, 0);
    ctx.restore();
    // drips
    ctx.fillStyle = color; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * w, y = h * 0.55 + Math.random() * h * 0.2;
      ctx.fillRect(x, y, 2, 6 + Math.random() * 22);
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function signTexture(lines, opts = {}) {
  const { bg = '#20242a', fg = '#c8cdd2', border = '#8a8f94', w = 512, h = 160, font = 'Arial Black' } = opts;
  const t = canvas(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 700, 0.2);
    stains(ctx, w, h, 4, 'rgba(10,10,10,0.4)');
    ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, i) => {
      const fs = n === 1 ? h * 0.5 : h * (i === 0 ? 0.38 : 0.24);
      ctx.font = `900 ${fs | 0}px '${font}', sans-serif`;
      ctx.fillText(line, w / 2, h * (n === 1 ? 0.5 : (i === 0 ? 0.34 : 0.72)));
    });
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function radiationSignTexture() {
  const t = canvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9a8a20'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 900, 0.25);
    ctx.strokeStyle = '#141208'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    // trefoil
    ctx.fillStyle = '#141208';
    const cx = w / 2, cy = h * 0.42, r = 52;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.font = `900 30px 'Arial Black', sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('РАДИАЦИЯ', w / 2, h * 0.82);
    ctx.font = `900 20px 'Arial Black', sans-serif`;
    ctx.fillText('RADIATION', w / 2, h * 0.93);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function posterTexture(title, sub, hue = 0) {
  const t = canvas(256, 384, (ctx, w, h) => {
    ctx.fillStyle = hue === 0 ? '#7a2c22' : '#2c4a5a'; ctx.fillRect(0, 0, w, h);
    // constructivist diagonal
    ctx.fillStyle = hue === 0 ? '#a8432f' : '#3f6a80';
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h * 0.3); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(230,220,190,0.9)';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.32, 44, 0, 7); ctx.fill();
    ctx.fillStyle = hue === 0 ? '#7a2c22' : '#2c4a5a';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.30, 30, 0, 7); ctx.fill(); // head silhouette
    ctx.fillRect(w * 0.36, h * 0.40, w * 0.28, h * 0.14); // shoulders
    ctx.fillStyle = '#e8dfc8'; ctx.textAlign = 'center';
    ctx.font = `900 26px 'Arial Black', sans-serif`;
    ctx.fillText(title, w / 2, h * 0.72);
    ctx.font = `700 15px Arial, sans-serif`;
    ctx.fillText(sub, w / 2, h * 0.80);
    // aging
    stains(ctx, w, h, 8, 'rgba(40,32,22,0.4)');
    speckle(ctx, w, h, 1200, 0.2);
    ctx.strokeStyle = 'rgba(30,25,18,0.6)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function bloodTexture(size = 128) {
  const t = canvas(size, size, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * w * 0.32;
      const r = 3 + Math.random() * (w * 0.16) * (1 - d / (w * 0.4));
      ctx.fillStyle = `rgba(${60 + Math.random() * 30 | 0},8,6,${0.5 + Math.random() * 0.4})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.5, r), 0, 7); ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = w * 0.3 + Math.random() * w * 0.18;
      ctx.fillStyle = 'rgba(55,8,6,0.7)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + Math.random() * 3, 0, 7); ctx.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function noiseTexture(size = 128) {
  const t = canvas(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function dirtDecalTexture(size = 256) {
  const t = canvas(size, size, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    stains(ctx, w, h, 10, 'rgba(12,12,10,0.55)', 70);
    stains(ctx, w, h, 5, 'rgba(30,26,18,0.4)', 50);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Derive tangent-space normal + roughness maps from a procedural color canvas.
// Height = luminance; normals via wrapped central differences (seamless tiling).
export function deriveMaps(colorTex, { strength = 2, roughBase = 0.85, roughVar = 0.25 } = {}) {
  const c = colorTex.image;
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    height[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  }
  const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
  const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
  const nctx = nc.getContext('2d'), rctx = rc.getContext('2d');
  const nimg = nctx.createImageData(w, h), rimg = rctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = height[y * w + ((x - 1 + w) % w)], r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x], d = height[((y + 1) % h) * w + x];
      const dx = (r - l) * strength, dy = (d - u) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      nimg.data[i * 4] = (-dx * inv * 0.5 + 0.5) * 255;
      // canvas y is down; flipY upload makes +dy the GL-convention green-up
      nimg.data[i * 4 + 1] = (dy * inv * 0.5 + 0.5) * 255;
      nimg.data[i * 4 + 2] = (inv * 0.5 + 0.5) * 255;
      nimg.data[i * 4 + 3] = 255;
      const rv = Math.max(0, Math.min(1, roughBase + (0.5 - height[i]) * roughVar * 2)) * 255;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rv;
      rimg.data[i * 4 + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const mk = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  return { normal: mk(nc), rough: mk(rc) };
}
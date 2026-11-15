import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const missing = [];

function checkAsset(value, source) {
  if (typeof value !== 'string') return;
  const relative = value.replaceAll('\\', '/');
  if (relative.startsWith('/') || /^[a-z]:/i.test(relative) || relative.split('/').includes('..')) {
    missing.push(`${source}: unsafe asset path ${value}`);
    return;
  }
  const file = path.resolve(root, 'assets', relative);
  const fromAssets = path.relative(path.join(root, 'assets'), file);
  if (fromAssets === '..' || fromAssets.startsWith(`..${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    missing.push(`${source}: missing ${value}`);
  }
}

for (const [name, textureSet] of Object.entries(manifest.textures || {})) {
  for (const [kind, file] of Object.entries(textureSet)) checkAsset(file, `textures.${name}.${kind}`);
}
for (const [name, model] of Object.entries(manifest.models || {})) checkAsset(model.gltf, `models.${name}.gltf`);
for (const [name, character] of Object.entries(manifest.characters || {})) checkAsset(character.gltf, `characters.${name}.gltf`);

function checkGltf(file, visited = new Set()) {
  const absolute = path.resolve(root, 'assets', file);
  if (visited.has(absolute)) return;
  visited.add(absolute);
  const document = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  for (const buffer of document.buffers || []) checkAsset(path.posix.join(path.posix.dirname(file), buffer.uri || ''), `${file} buffer`);
  for (const image of document.images || []) {
    if (image.uri) checkAsset(path.posix.join(path.posix.dirname(file), image.uri), `${file} image`);
  }
}

for (const model of Object.values(manifest.models || {})) {
  if (model.gltf && fs.existsSync(path.resolve(root, 'assets', model.gltf))) checkGltf(model.gltf);
}

if (missing.length) {
  console.error(missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Asset validation passed: manifest paths and glTF buffers/images exist.');
}

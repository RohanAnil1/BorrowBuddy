/** Export the website's procedural device geometry and original canvas painters as a native GLB.
 * Run from the repository root with the web dev server running; NODE_MODULES_PATH may supply Playwright.
 * No image generation, downloaded models or visual redesign are involved.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { toCreasedNormals } from 'three-stdlib';
import ts from 'typescript';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch {
  if (!process.env.NODE_MODULES_PATH) throw new Error('Provide NODE_MODULES_PATH for the Playwright installation.');
  playwright = require(path.join(process.env.NODE_MODULES_PATH, 'playwright'));
}
const root = process.cwd();
const textures = [];
if (process.argv.includes('--reuse-textures')) {
  const previous = await fs.readFile(path.join(root, 'apps/android/app/src/main/assets/models/cargo-device.glb'));
  const jsonLength = previous.readUInt32LE(12);
  const previousGltf = JSON.parse(previous.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 28 + jsonLength;
  for (const image of previousGltf.images) {
    const view = previousGltf.bufferViews[image.bufferView];
    textures.push(previous.subarray(binaryStart + view.byteOffset, binaryStart + view.byteOffset + view.byteLength));
  }
} else {
 const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(process.env.WEB_URL || 'http://localhost:3000', { waitUntil: 'networkidle' });
  const source = await fs.readFile(path.join(root, 'apps/web/src/components/landing/device/screen-art.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  await page.addScriptTag({ content: `var exports = {};\n${compiled}\nwindow.cargoPainter = exports;` });
  const data = await page.evaluate(async () => {
    await document.fonts.ready;
    await window.cargoPainter.loadBuLogo();
    return ['paintCargoScreen', 'paintGrille', 'paintContactShadow'].map(name => {
      const canvas = document.createElement('canvas');
      window.cargoPainter[name](canvas);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  });
  for (const item of data) textures.push(Buffer.from(item, 'base64'));
 } finally { await browser.close(); }
}

const gltf = {
  asset: { version: '2.0', generator: 'BorrowBuddy procedural device export' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'CargoDeviceRoot', children: [] }],
  meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
  images: [], textures: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  extensionsUsed: ['KHR_materials_clearcoat', 'KHR_materials_unlit'],
};
const chunks = [];
let length = 0;
function bufferView(buffer, target) {
  const padding = (4 - length % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
  const index = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, ...(target ? { target } : {}) });
  chunks.push(buffer); length += buffer.length;
  return index;
}
for (const png of textures) {
  gltf.images.push({ bufferView: bufferView(png), mimeType: 'image/png' });
  gltf.textures.push({ source: gltf.images.length - 1, sampler: 0 });
}
function color(hex, alpha = 1) { const c = new THREE.Color(hex); return [c.r, c.g, c.b, alpha]; }
function material(hex, metal, roughness, extra = {}) {
  const index = gltf.materials.length;
  gltf.materials.push({ pbrMetallicRoughness: { baseColorFactor: color(hex), metallicFactor: metal, roughnessFactor: roughness }, ...extra });
  return index;
}
const body = material('#c9cdd4', .82, .34, { extensions: { KHR_materials_clearcoat: { clearcoatFactor: .9, clearcoatRoughnessFactor: .18 } } });
const face = material('#0b0d12', .5, .45);
const screen = material('#ffffff', 0, .4, {
  pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: .4 },
  emissiveTexture: { index: 0 }, emissiveFactor: [1, 1, 1],
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: .55, clearcoatRoughnessFactor: .22 } },
});
const slot = material('#05070e', .4, .5);
const black = material('#000000', 0, 1, { extensions: { KHR_materials_unlit: {} } });
const led = material('#ff9f00', 0, 1, { extensions: { KHR_materials_unlit: {} }, emissiveFactor: color('#ff9f00').slice(0, 3) });
const grille = material('#ffffff', 0, 1, {
  pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [1, 1, 1, .9], metallicFactor: 0, roughnessFactor: 1 },
  alphaMode: 'BLEND', extensions: { KHR_materials_unlit: {} }, doubleSided: true,
});
const button = material('#9aa0a8', .7, .35);
const brand = material('#6176c9', 0, 1, { extensions: { KHR_materials_unlit: {} } });
const shadow = material('#ffffff', 0, 1, {
  pbrMetallicRoughness: { baseColorTexture: { index: 2 }, baseColorFactor: [1, 1, 1, .35], metallicFactor: 0, roughnessFactor: 1 },
  alphaMode: 'BLEND', extensions: { KHR_materials_unlit: {} }, doubleSided: true,
});
function accessor(attribute, type, target) {
  const array = attribute.array;
  const index = gltf.accessors.length;
  const componentType = array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : 5123;
  const item = { bufferView: bufferView(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target), componentType, count: attribute.count, type };
  if (type === 'VEC3' && target === 34962 && attribute.itemSize === 3) {
    item.min = [Infinity, Infinity, Infinity]; item.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < attribute.count; i++) for (let axis = 0; axis < 3; axis++) {
      const value = array[i * 3 + axis]; item.min[axis] = Math.min(item.min[axis], value); item.max[axis] = Math.max(item.max[axis], value);
    }
  }
  gltf.accessors.push(item); return index;
}
function mesh(name, geometry, materialIndex, position = [0, 0, 0], rotation = [0, 0, 0], devicePart = true) {
  // glTF textures use top-left UV origin; Three.js canvas textures normally flip on upload.
  if (materialIndex === screen || materialIndex === grille || materialIndex === shadow) {
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  const primitive = { attributes: { POSITION: accessor(geometry.getAttribute('position'), 'VEC3', 34962), NORMAL: accessor(geometry.getAttribute('normal'), 'VEC3', 34962) }, material: materialIndex };
  if (geometry.getAttribute('uv')) primitive.attributes.TEXCOORD_0 = accessor(geometry.getAttribute('uv'), 'VEC2', 34962);
  if (geometry.index) primitive.indices = accessor(geometry.index, 'SCALAR', 34963);
  gltf.meshes.push({ name, primitives: [primitive] });
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).toArray();
  gltf.nodes.push({ name, mesh: gltf.meshes.length - 1, translation: position, rotation: quaternion });
  if (devicePart) gltf.nodes[0].children.push(gltf.nodes.length - 1);
  else gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
  geometry.dispose();
}
// Match Drei's actual extruded RoundedBox implementation rather than the different Three.js fillet.
function rounded(w, h, d, radius, smoothness = 10) {
  const epsilon = .00001;
  const r = radius - epsilon;
  const shape = new THREE.Shape();
  shape.absarc(epsilon, epsilon, epsilon, -Math.PI / 2, -Math.PI, true);
  shape.absarc(epsilon, h - r * 2, epsilon, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r * 2, h - r * 2, epsilon, Math.PI / 2, 0, true);
  shape.absarc(w - r * 2, epsilon, epsilon, 0, -Math.PI / 2, true);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - radius * 2, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: r, bevelThickness: radius, curveSegments: smoothness });
  geometry.center();
  return toCreasedNormals(geometry, .4);
}
mesh('GunmetalBody', rounded(2.4, 3.5, .4, .28), body);
mesh('SatinFaceplate', rounded(2.24, 3.34, .07, .16), face, [0, 0, .2]);
mesh('CargoScreen', new THREE.PlaneGeometry(1.9, 1.9 * 720 / 512), screen, [0, -.05, .242]);
mesh('TicketSlot', rounded(1.02, .17, .1, .05, 6), slot, [0, 1.5, .2]);
mesh('SlotOpening', new THREE.BoxGeometry(.86, .03, .02), black, [0, 1.5, .243]);
mesh('StatusLed', new THREE.SphereGeometry(.032, 16, 16), led, [.88, 1.5, .235]);
mesh('SpeakerGrille', new THREE.PlaneGeometry(1.7, .2), grille, [0, -1.52, .236]);
mesh('UpperSideButton', rounded(.1, .34, .14, .045, 8), button, [1.23, .85, 0]);
mesh('LowerSideButton', rounded(.1, .22, .14, .045, 8), button, [1.23, .35, 0]);
mesh('BackBrandStrip', new THREE.PlaneGeometry(1.3, .22), brand, [0, -.7, -.201], [0, Math.PI, 0]);
mesh('ContactShadowTint', new THREE.PlaneGeometry(3.8, 1.4), shadow, [0, -2.12, .001], [-Math.PI / 2, 0, 0], false);
gltf.buffers[0].byteLength = length;
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const binary = Buffer.concat([...chunks, Buffer.alloc((4 - length % 4) % 4)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonPadded.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
const destination = path.join(root, 'apps/android/app/src/main/assets/models/cargo-device.glb');
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binary]));
console.log(`Exported original device: ${gltf.meshes.length} meshes, ${textures.length} source-painted textures, ${gltf.accessors.length} accessors.`);

/** Export original website station/belt JSX and canvas painters to native assets.
 * Run at repository root. Playwright may be supplied through NODE_MODULES_PATH.
 * JavaScript is used only at build time; the Android runtime loads GLB/PNG assets.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { toCreasedNormals } from 'three-stdlib';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = process.cwd();
const sourceDir = path.join(root, 'apps/web/src/components/landing/line');
const output = path.join(root, 'apps/android/app/src/main/assets/models/conveyor');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.NODE_MODULES_PATH, 'playwright')); }
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  jsxFactory: 'jsx', jsxFragmentFactory: 'Fragment', esModuleInterop: true
} }).outputText;
const sources = {};
for (const name of ['timeline', 'paint', 'belt', 'station']) sources[name] = await fs.readFile(path.join(sourceDir, `${name}.${['belt', 'station'].includes(name) ? 'tsx' : 'ts'}`), 'utf8');
const timeline = {};
new Function('exports', compile(sources.timeline))(timeline);

// Bundle the installed QR painter's browser-only CommonJS dependency graph.
const modules = [];
const moduleIds = new Map();
async function bundleModule(file) {
  if (moduleIds.has(file)) return moduleIds.get(file);
  const id = modules.length;
  moduleIds.set(file, id); modules.push(null);
  const code = await fs.readFile(file, 'utf8');
  const deps = {};
  for (const match of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    deps[match[1]] = await bundleModule(createRequire(file).resolve(match[1]));
  }
  modules[id] = { code, deps };
  return id;
}
const qrEntry = await bundleModule(require.resolve('qrcode/lib/browser.js'));
const browser = await playwright.chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
let painted;
try {
  const page = await browser.newPage();
  const font = async name => (await fs.readFile(path.join(root, 'apps/web/src/fonts', name))).toString('base64');
  await page.setContent(`<style>
    @font-face{font-family:BBCond;src:url(data:font/woff2;base64,${await font('NotoSans_ExtraCondensed-Bold-Regular.woff2')});font-weight:700}
    @font-face{font-family:BBMono;src:url(data:font/woff2;base64,${await font('NotoSansMono-Bold-Regular.woff2')});font-weight:700}
    :root{--ff-noto-cond:BBCond;--ff-noto-mono:BBMono}
  </style>`);
  await page.evaluate(async () => { await Promise.all([document.fonts.load('700 44px BBCond'), document.fonts.load('700 20px BBMono')]); });
  painted = await page.evaluate(async ({ modules, qrEntry, paint, timeline }) => {
    const cache = {};
    function load(id) {
      if (cache[id]) return cache[id].exports;
      const module = { exports: {} }; cache[id] = module;
      new Function('require', 'module', 'exports', modules[id].code)(name => load(modules[id].deps[name]), module, module.exports);
      return module.exports;
    }
    const defs = {}; new Function('exports', timeline)(defs);
    const painters = {}; new Function('require', 'exports', paint)(name => name === 'qrcode' ? load(qrEntry) : defs, painters);
    const images = {};
    async function capture(key, painter, ...args) {
      const canvas = document.createElement('canvas');
      if (key.startsWith('plate-')) { canvas.width = 160; canvas.height = 240; }
      await painter(canvas, ...args);
      images[key] = canvas.toDataURL('image/png').split(',')[1];
    }
    for (const name of ['Curtain', 'RadialGlow', 'Hazard', 'Lens', 'Slats', 'TrustChip']) await capture(name.toLowerCase(), painters[`paint${name}`]);
    for (const gate of defs.GATES) for (const phase of ['idle', 'wake', 'scan', 'after', 'still']) {
      await capture(`plate-${gate.code}-${phase}`, painters.paintIdPlate, gate.code, phase);
      await capture(`sign-${gate.code}-${phase}`, painters.paintSign, gate.code, gate.label, phase);
    }
    for (const crate of defs.CRATES) {
      await capture(`back-${crate.id}`, painters.paintParcelBack, crate);
      for (let stamps = 0; stamps <= 4; stamps++) await capture(`front-${crate.id}-${stamps}`, painters.paintParcelFront, crate, stamps);
    }
    return images;
  }, { modules, qrEntry, paint: compile(sources.paint), timeline: compile(sources.timeline) });
} finally { await browser.close(); }
await fs.mkdir(output, { recursive: true });
for (const [name, png] of Object.entries(painted)) await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(png, 'base64'));

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });
const Fragment = Symbol('fragment');
const canvasDocument = { createElement: () => ({ width: 1, height: 1, textureKey: null }) };
const texture = key => new THREE.CanvasTexture({ width: 512, height: 720, textureKey: key });
const paintMock = {
  paintSlats: canvas => { canvas.textureKey = 'slats'; },
  paintIdPlate: (canvas, code, phase) => { canvas.textureKey = `plate-${code}-${phase}`; },
  paintSign: (canvas, code, label, phase) => { canvas.textureKey = `sign-${code}-${phase}`; }
};
let refNames = [], refCursor = 0;
const hooks = {
  useMemo: factory => factory(), useEffect: () => {},
  useRef: initial => ({ current: initial, role: refNames[refCursor++] })
};
function loadComponent(name) {
  const exports = {};
  const imports = { react: hooks, three: THREE, './paint': paintMock, './timeline': timeline,
    '@react-three/fiber': { useFrame: () => {}, useThree: selector => selector ? selector({ invalidate: () => {} }) : {} },
    '@react-three/drei': { SpotLight: () => null } };
  new Function('require', 'exports', 'jsx', 'Fragment', 'document', compile(sources[name]))(key => {
    if (!(key in imports)) throw new Error(`Unsupported component import ${key}`);
    return imports[key];
  }, exports, jsx, Fragment, canvasDocument);
  return exports;
}
const { Station3D } = loadComponent('station');
const { Belt } = loadComponent('belt');
function build(element, parent, prefix, counter) {
  if (!element || typeof element !== 'object') return;
  if (Array.isArray(element)) { for (const child of element) build(child, parent, prefix, counter); return; }
  const { type, props, children } = element;
  if (typeof type === 'function') { build(type(props), parent, prefix, counter); return; }
  if (type === Fragment) { children.forEach(child => build(child, parent, prefix, counter)); return; }
  let object;
  if (type === 'group') object = new THREE.Group();
  else if (type === 'mesh') {
    const geometry = children.find(child => typeof child?.type === 'string' && child.type.endsWith('Geometry'));
    const material = children.find(child => typeof child?.type === 'string' && child.type.endsWith('Material'));
    if (!geometry || !material) throw new Error(`Missing geometry/material in ${prefix}`);
    const geometryType = geometry.type[0].toUpperCase() + geometry.type.slice(1);
    const materialType = material.type[0].toUpperCase() + material.type.slice(1);
    const params = { ...material.props }; delete params.ref;
    object = new THREE.Mesh(new THREE[geometryType](...(geometry.props.args || [])), new THREE[materialType](params));
    if (material.props.ref?.role) object.name = `${prefix}-${material.props.ref.role}`;
    else if (typeof material.props.ref === 'function') {
      const role = material.props.ref.toString().match(/(\w+)\.current/)?.[1];
      if (role) { counter.roles ||= {}; const index = counter.roles[role] || 0; counter.roles[role] = index + 1; object.name = `${prefix}-${role}-${index}`; }
    }
  } else if (type === 'primitive') return;
  else throw new Error(`Unsupported scene node ${String(type)}`);
  if (!object.name && props.ref?.role) object.name = `${prefix}-${props.ref.role}`;
  if (!object.name && typeof props.ref === 'function') {
    const role = props.ref.toString().match(/(\w+)\.current/)?.[1];
    if (role) { counter.roles ||= {}; const index = counter.roles[role] || 0; counter.roles[role] = index + 1; object.name = `${prefix}-${role}-${index}`; }
  }
  object.name ||= `${prefix}-${type}-${counter.value++}`;
  if (props.position) object.position.fromArray(props.position);
  if (props.rotation) object.rotation.fromArray(props.rotation);
  if (props.scale != null) typeof props.scale === 'number' ? object.scale.setScalar(props.scale) : object.scale.fromArray(props.scale);
  if (props.visible === false) object.userData.initiallyHidden = true;
  if (parent.userData.initiallyHidden) object.userData.initiallyHidden = true;
  parent.add(object);
  if (type === 'group') children.forEach(child => build(child, object, prefix, counter));
}

// Match the website's actual Drei extruded RoundedBox geometry.
function rounded(w, h, d, radius, smoothness = 6) {
  const e = .00001, r = radius - e, shape = new THREE.Shape();
  shape.absarc(e, e, e, -Math.PI / 2, -Math.PI, true);
  shape.absarc(e, h - r * 2, e, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r * 2, h - r * 2, e, Math.PI / 2, 0, true);
  shape.absarc(w - r * 2, e, e, 0, -Math.PI / 2, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - radius * 2, bevelEnabled: true,
    bevelSegments: 8, steps: 1, bevelSize: r, bevelThickness: radius, curveSegments: smoothness });
  geo.center(); return toCreasedNormals(geo, .4);
}

async function exportScene(span) {
  const scene = new THREE.Group(); scene.name = 'ConveyorRoot';
  const add = (name, geometry, material, position, rotation) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    if (position) mesh.position.fromArray(position); if (rotation) mesh.rotation.fromArray(rotation);
    scene.add(mesh); return mesh;
  };
  add('HallFloor', new THREE.PlaneGeometry(90, 46), new THREE.MeshStandardMaterial({ color: '#0d0a07', metalness: .1, roughness: .95 }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  add('BackWall', new THREE.PlaneGeometry(span + 12, 8), new THREE.MeshStandardMaterial({ color: '#0e0b08', metalness: .06, roughness: .95 }), [0, 3.4, -2.8]);
  build(Belt({ span, speed: span * .25 / 1.9, reduced: false }), scene, 'Belt', { value: 0 });
  scene.traverse(object => { if (object.material?.map?.image?.textureKey === 'slats') object.name = 'BeltSurface'; });
  const shared = { curtain: texture('curtain'), glow: texture('radialglow'), hazard: texture('hazard'), lens: texture('lens') };
  for (let index = 0; index < timeline.GATES.length; index++) {
    refNames = [...sources.station.matchAll(/const (\w+) = useRef/g)].map(match => match[1]); refCursor = 0;
    build(Station3D({ compact: span === 12, gate: timeline.GATES[index], index, phase: 'idle', reduced: false,
      shared, x: timeline.toWorldX(timeline.GATE_X[index], span) }), scene, `Station${index}`, { value: 0 });
  }
  const signs = [];
  scene.traverse(object => {
    const key = object.material?.map?.image?.textureKey;
    if (key && (key.startsWith('sign-') || key.startsWith('plate-'))) signs.push(object);
  });
  for (const original of signs) {
    const [kind, gate, number] = original.material.map.image.textureKey.split('-');
    const station = Number(number) - 1;
    original.name = `Station${station}-${kind}-idle`;
  }
  const parcel = new THREE.Group(); parcel.name = 'ParcelRoot'; parcel.position.set(timeline.toWorldX(-.16, span), 1.575, 0);
  const flip = new THREE.Group(); flip.name = 'ParcelFlip'; parcel.add(flip); scene.add(parcel);
  const body = new THREE.Mesh(rounded(1.5, 2.05, 1.15, .05), new THREE.MeshStandardMaterial({ color: '#8a6a44', metalness: .05, roughness: .85 })); body.name = 'ParcelBody'; flip.add(body);
  for (const crate of timeline.CRATES.slice(0, 1)) for (const [side, z, rotation, roughness, emissiveIntensity] of [['front', .577, 0, .9, .16], ['back', -.577, Math.PI, .7, .22]]) {
    for (let stamps = 0; stamps < 1; stamps++) {
      const key = side === 'front' ? `front-${crate.id}-${stamps}` : `back-${crate.id}`;
      const map = texture(key);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.9), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity, metalness: 0, roughness }));
      face.name = `Parcel-${key}`; face.position.set(0, .01, z); face.rotation.y = rotation;
      face.userData.initiallyHidden = !(crate.id === 'sony' && stamps === 0); flip.add(face);
    }
  }
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .05), new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true }));
  scan.name = 'ParcelScanLine'; scan.position.set(0, .9, .6); scan.userData.initiallyHidden = true; flip.add(scan);
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.92), new THREE.MeshBasicMaterial({ color: '#ffb24d', opacity: 0, transparent: true }));
  wash.name = 'ParcelScanWash'; wash.position.set(0, .01, .585); flip.add(wash);
  const trust = add('TrustChip', new THREE.PlaneGeometry(1.24, .465), new THREE.MeshBasicMaterial({ map: texture('trustchip'), transparent: true }), [0, 3, .4]);
  trust.userData.initiallyHidden = true;
  const gltf = { asset: { version: '2.0', generator: 'BorrowBuddy original conveyor JSX export' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }], images: [], textures: [], samplers: [],
    extensionsUsed: ['KHR_materials_unlit', 'KHR_texture_transform'] };
  const chunks = []; let length = 0;
  function view(buffer, target) {
    const pad = (4 - length % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const index = gltf.bufferViews.length; gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, ...(target ? { target } : {}) });
    chunks.push(buffer); length += buffer.length; return index;
  }
  const imageIndices = new Map(), textureIndices = new Map();
  function mapInfo(map) {
    const key = map.image.textureKey; if (!painted[key]) throw new Error(`Missing original texture ${key}`);
    if (!imageIndices.has(key)) { imageIndices.set(key, gltf.images.length); gltf.images.push({ name: key, mimeType: 'image/png', bufferView: view(Buffer.from(painted[key], 'base64')) }); }
    const sampler = { magFilter: 9729, minFilter: 9987, wrapS: map.wrapS === THREE.RepeatWrapping ? 10497 : 33071, wrapT: 33071 };
    const signature = JSON.stringify([key, sampler]);
    if (!textureIndices.has(signature)) {
      textureIndices.set(signature, gltf.textures.length); gltf.samplers.push(sampler);
      gltf.textures.push({ source: imageIndices.get(key), sampler: gltf.samplers.length - 1 });
    }
    const info = { index: textureIndices.get(signature) };
    if (map.repeat.x !== 1 || map.repeat.y !== 1) info.extensions = { KHR_texture_transform: { scale: map.repeat.toArray() } };
    return info;
  }
  function accessor(attribute, type, target) {
    const array = attribute.array; const a = { bufferView: view(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target),
      componentType: array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : 5123, count: attribute.count, type };
    if (type === 'VEC3') {
      a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < attribute.count; i++) for (let j = 0; j < 3; j++) { const value = array[i * 3 + j]; a.min[j] = Math.min(a.min[j], value); a.max[j] = Math.max(a.max[j], value); }
    }
    gltf.accessors.push(a); return gltf.accessors.length - 1;
  }
  const manifest = [];
  function node(object) {
    if (object.isMesh) object.userData.baseColor = [...object.material.color.toArray(), object.material.opacity];
    const id = gltf.nodes.length;
    const entry = { name: object.name, translation: object.position.toArray(), rotation: object.quaternion.toArray(), scale: object.scale.toArray(), extras: object.userData };
    gltf.nodes.push(entry); manifest.push({ ...entry });
    if (object.isMesh) {
      const m = object.material, g = object.geometry.clone(), c = m.color;
      const material = { name: object.name, pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, m.opacity], metallicFactor: m.metalness ?? 0, roughnessFactor: m.roughness ?? 1 }, doubleSided: m.side === THREE.DoubleSide };
      if (m.isMeshBasicMaterial) material.extensions = { KHR_materials_unlit: {} };
      if (m.transparent || m.opacity < 1 || m.blending === THREE.AdditiveBlending) material.alphaMode = 'BLEND';
      if (m.map) { material.pbrMetallicRoughness.baseColorTexture = mapInfo(m.map); const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
      if (m.emissiveMap) material.emissiveTexture = mapInfo(m.emissiveMap);
      if (m.emissive) material.emissiveFactor = m.emissive.toArray().map(v => v * m.emissiveIntensity);
      const materialId = gltf.materials.length; gltf.materials.push(material);
      const primitive = { attributes: { POSITION: accessor(g.getAttribute('position'), 'VEC3', 34962), NORMAL: accessor(g.getAttribute('normal'), 'VEC3', 34962) }, material: materialId };
      if (g.getAttribute('uv')) primitive.attributes.TEXCOORD_0 = accessor(g.getAttribute('uv'), 'VEC2', 34962);
      if (g.index) primitive.indices = accessor(g.index, 'SCALAR', 34963);
      entry.mesh = gltf.meshes.length; gltf.meshes.push({ name: object.name, primitives: [primitive] }); g.dispose();
    }
    if (object.children.length) entry.children = object.children.map(node);
    return id;
  }
  node(scene); gltf.buffers[0].byteLength = length;
  const json = Buffer.from(JSON.stringify(gltf)); const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binary = Buffer.concat([...chunks, Buffer.alloc((4 - length % 4) % 4)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4);
  await fs.writeFile(path.join(output, `line-${span}.glb`), Buffer.concat([header, jh, jsonPadded, bh, binary]));
  await fs.writeFile(path.join(output, `line-${span}-nodes.json`), JSON.stringify(manifest, null, 2));
  console.log(`Original ${span}-unit conveyor: ${gltf.meshes.length} meshes, ${gltf.images.length} embedded textures.`);
}
await exportScene(12); await exportScene(24);
console.log(`Exported ${Object.keys(painted).length} original painted textures, including all gate phases and parcel stamps.`);

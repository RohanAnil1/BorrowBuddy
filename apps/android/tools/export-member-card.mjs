// Preserve the user-supplied React Bits card/clamp geometry. The band uses 72
// independent skin joints so native Kotlin can drive the same curved ribbon.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const source = await fs.readFile('apps/web/src/components/reactbits/lanyard/Lanyard.jsx', 'utf8');
const functionSource = name => {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`Missing source geometry: ${name}`);
  const end = source.indexOf('\nconst ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
};
const api = new Function('THREE', `
const CARD_SIZES = { portrait: [1.6, 2.25], landscape: [2.25, 1.6] };
const THICKNESS = 0.018, BEVEL = 0.007, RING_RADIUS = 0.095, CLAMP_BODY = 0.15;
const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
const mix = (a,b,t) => a+(b-a)*t;
${['traceRoundedRect','cardLayout','buildCardGeometry','buildClampGeometry'].map(functionSource).join('\n')}
return { cardLayout, buildCardGeometry, buildClampGeometry };`)(THREE);
const scene = new THREE.Scene();
const root = new THREE.Group(); root.name = 'MemberCardScene'; scene.add(root);
const card = new THREE.Group(); card.name = 'MemberCardBody'; root.add(card);
const layout = api.cardLayout('portrait', .3), geometry = api.buildCardGeometry(layout);
const frontMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85 }); frontMaterial.name = 'MemberFrontMaterial';
const backMaterial = frontMaterial.clone(); backMaterial.name = 'MemberBackMaterial';
const edge = new THREE.MeshStandardMaterial({ color: 0x080b10, roughness: .35 }); edge.name = 'MemberEdgeMaterial';
const metal = new THREE.MeshStandardMaterial({ color: 0xd9dce2, metalness: 1, roughness: .16 }); metal.name = 'MemberMetalMaterial';
const add = (name, geom, mat, parent = card) => { const mesh = new THREE.Mesh(geom, mat); mesh.name = name; parent.add(mesh); return mesh; };
add('MemberCardEdge', geometry.body, edge);
add('MemberCardFront', geometry.face, frontMaterial).position.z = .0166;
const back = add('MemberCardBack', geometry.face.clone(), backMaterial); back.position.z = -.0166; back.rotation.y = Math.PI;
const ring = add('MemberRing', new THREE.TorusGeometry(.095, .0135, 18, 72), metal); ring.position.y = layout.ringY; ring.rotation.y = Math.PI / 2 - .7;
const clasp = new THREE.Group(); clasp.name = 'MemberClasp'; root.add(clasp);
const clamp = add('MemberClamp', api.buildClampGeometry(.36 * .65), metal, clasp); clamp.position.y = .036 + .15 / 2 - .004;
add('MemberEyelet', new THREE.TorusGeometry(.036, .0105, 14, 40), metal, clasp);
const count = 72, positions = [], normals = [], uv = [], joints = [], weights = [], indices = [], bones = [];
const columns = [0,.07,.93,1], bend = [-.95,-.28,.28,.95];
for (let i = 0; i < count; i++) {
  const bone = new THREE.Bone(); bone.name = `MemberBandJoint${i}`; bone.position.y = -i / (count - 1); root.add(bone); bones.push(bone);
  for (let c = 0; c < 4; c++) {
    positions.push((columns[c] - .5) * .234, -i / (count - 1), 0);
    normals.push(Math.sin(bend[c]), 0, Math.cos(bend[c]));
    uv.push(columns[c], (1 - i / (count - 1)) * 3);
    joints.push(i,0,0,0); weights.push(1,0,0,0);
    if (i < count - 1 && c < 3) { const a = i * 4 + c; indices.push(a,a+4,a+1,a+1,a+4,a+5); }
  }
}
const ribbon = new THREE.BufferGeometry();
ribbon.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
ribbon.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
ribbon.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
ribbon.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
ribbon.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4)); ribbon.setIndex(indices);
const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .68, side: THREE.DoubleSide }); bandMaterial.name = 'MemberStrapMaterial';
const band = new THREE.SkinnedMesh(ribbon, bandMaterial); band.name = 'MemberBand'; root.add(band);
scene.updateMatrixWorld(true); band.bind(new THREE.Skeleton(bones));
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:application/octet-stream;base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const json = await new GLTFExporter().parseAsync(scene, { binary: false });
const binary = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const pngOffset = (binary.length + 3) & ~3;
const packed = Buffer.alloc((pngOffset + png.length + 3) & ~3); binary.copy(packed); png.copy(packed, pngOffset);
json.bufferViews.push({ buffer: 0, byteOffset: pngOffset, byteLength: png.length });
json.images = [{ bufferView: json.bufferViews.length - 1, mimeType: 'image/png' }];
json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 10497 }];
json.textures = [{ sampler: 0, source: 0 }];
for (const material of json.materials) if (['MemberFrontMaterial','MemberBackMaterial','MemberStrapMaterial'].includes(material.name)) material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
json.buffers = [{ byteLength: packed.length }];
const raw = Buffer.from(JSON.stringify(json)); const text = Buffer.alloc((raw.length + 3) & ~3, 32); raw.copy(text);
const glb = Buffer.alloc(12 + 8 + text.length + 8 + packed.length);
glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(text.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); text.copy(glb, 20);
const start = 20 + text.length; glb.writeUInt32LE(packed.length, start); glb.writeUInt32LE(0x004e4942, start + 4); packed.copy(glb, start + 8);
await fs.writeFile('apps/android/app/src/main/assets/models/member-card.glb', glb);
console.log(`Exported original card/clamp/ring and 72-joint ribbon: ${glb.length} bytes`);

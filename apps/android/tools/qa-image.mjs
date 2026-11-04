import { deflateSync } from 'node:zlib';

// Valid opaque 2×2 synthetic fixture. Both browser and Android must decode these bytes.
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const data = Buffer.concat([name, bytes]);
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
const pixels = Buffer.from([0, 0, 57, 147, 255, 203, 132, 14, 255, 0, 71, 209, 138, 255, 240, 240, 240, 255]);
export const syntheticPng = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);

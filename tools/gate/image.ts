export interface Dimensions {
  width: number;
  height: number;
}

export const screenshotLimit = 512 * 1024;
export const screenshotTarget = 350_000;

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegStart = 0xffd8;
const jpegEnd = 0xffd9;

function pngDimensions(bytes: Buffer): Dimensions | undefined {
  if (
    bytes.length < 45 ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return;
  }
  let offset = 33;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) return;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IEND") {
      if (size === 0 && end === bytes.length) {
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      }
      return;
    }
    offset = end;
  }
}

function jpegDimensions(bytes: Buffer): Dimensions | undefined {
  const end = bytes.length - 2;
  if (end < 2 || bytes.readUInt16BE(end) !== jpegEnd) return;

  let offset = 2;
  while (offset < end && bytes[offset] === 0xff) {
    while (offset < end && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (!marker || marker === 0xda || marker === 0xd9) return;
    if (marker === 0x01) continue;
    if (offset + 2 > end) return;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > end) return;
    if (marker === 0xc0 || marker === 0xc2) {
      if (size < 8) return;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += size;
  }
}

export function imageDimensions(bytes: Buffer): Dimensions | undefined {
  if (bytes.subarray(0, pngSignature.length).equals(pngSignature)) return pngDimensions(bytes);
  if (bytes.length >= 2 && bytes.readUInt16BE(0) === jpegStart) return jpegDimensions(bytes);
}

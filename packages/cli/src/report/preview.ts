import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { mimeForExt } from "./assemble";

export interface PreviewInfo {
  path: string;
  mime: string;
  width?: number;
  height?: number;
}

export function inspectPreview(path: string): PreviewInfo {
  const absolute = resolve(path);
  if (!existsSync(absolute))
    throw new Error(`Preview image not found: ${absolute}`);

  const mime = mimeForExt(extname(absolute));
  if (!mime)
    throw new Error(
      `Unsupported preview image type: ${extname(absolute) || "unknown"}`,
    );

  const bytes = readFileSync(absolute);
  const dimensions = imageDimensions(bytes, mime);
  return { path: absolute, mime, ...dimensions };
}

export function copyCompanionPreview(
  source: string,
  destination: string,
): PreviewInfo {
  const info = inspectPreview(source);
  copyFileSync(info.path, destination);
  return info;
}

function imageDimensions(
  bytes: Buffer,
  mime: string,
): { width?: number; height?: number } {
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    bytes.subarray(1, 4).toString() === "PNG"
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (
    mime === "image/gif" &&
    bytes.length >= 10 &&
    bytes.subarray(0, 3).toString() === "GIF"
  ) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }

  if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString() === "RIFF"
  ) {
    const kind = bytes.subarray(12, 16).toString();
    if (kind === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
  }

  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (mime === "image/svg+xml") return svgDimensions(bytes.toString("utf-8"));
  return {};
}

function jpegDimensions(bytes: Buffer): { width?: number; height?: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return {};
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += length + 2;
  }
  return {};
}

function svgDimensions(svg: string): { width?: number; height?: number } {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return {};
  const number = (name: string) => {
    const value = tag.match(
      new RegExp(`\\b${name}=["']([0-9.]+)(?:px)?["']`, "i"),
    )?.[1];
    return value ? Number(value) : undefined;
  };
  const width = number("width");
  const height = number("height");
  if (width && height) return { width, height };
  const viewBox = tag.match(
    /\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i,
  );
  return viewBox
    ? { width: Number(viewBox[1]), height: Number(viewBox[2]) }
    : {};
}

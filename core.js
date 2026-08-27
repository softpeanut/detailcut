(function (root) {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "detail-page";
  }

  function scaledHeight(sourceWidth, sourceHeight, targetWidth) {
    if (![sourceWidth, sourceHeight, targetWidth].every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError("Image dimensions must be positive numbers.");
    }
    return Math.max(1, Math.round(sourceHeight * (targetWidth / sourceWidth)));
  }

  function chooseQuietCut(scores, rangeStart, idealEnd, distanceWeight = 0.15) {
    if (!Array.isArray(scores) && !(scores instanceof Float64Array)) {
      throw new TypeError("Row scores must be an array.");
    }
    if (!Number.isInteger(rangeStart) || !Number.isInteger(idealEnd) || rangeStart < 0 || idealEnd <= rangeStart) {
      throw new RangeError("Cut range is invalid.");
    }
    if (scores.length !== idealEnd - rangeStart + 1) {
      throw new RangeError("Row scores do not match the cut range.");
    }

    let bestRow = idealEnd;
    let bestScore = Infinity;
    const span = Math.max(1, idealEnd - rangeStart);
    for (let index = 0; index < scores.length; index += 1) {
      const row = rangeStart + index;
      const normalizedDistance = (idealEnd - row) / span;
      const score = scores[index] + normalizedDistance * distanceWeight;
      if (score < bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }
    return bestRow;
  }

  function verifyCuts(cuts, totalHeight) {
    if (!Array.isArray(cuts) || cuts.length === 0) return false;
    let expectedStart = 0;
    for (const slice of cuts) {
      if (!slice || slice.start !== expectedStart || !Number.isInteger(slice.end) || slice.end <= slice.start) return false;
      expectedStart = slice.end;
    }
    return expectedStart === totalHeight;
  }

  function outputPath(name, index) {
    return `${slugify(name)}-${String(index + 1).padStart(2, "0")}.jpg`;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      table[value] = current >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let current = 0xffffffff;
    for (const byte of bytes) current = crcTable[(current ^ byte) & 255] ^ (current >>> 8);
    return (current ^ 0xffffffff) >>> 0;
  }

  function zipStore(entries) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 65535) {
      throw new RangeError("ZIP needs between 1 and 65,535 files.");
    }
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const u16 = (value) => new Uint8Array([value & 255, (value >>> 8) & 255]);
    const u32 = (value) => new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
    const join = (parts) => {
      const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
      let at = 0;
      for (const part of parts) {
        output.set(part, at);
        at += part.length;
      }
      return output;
    };

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const crc = crc32(data);
      const local = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
      locals.push(local);
      centrals.push(join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
      offset += local.length;
    }
    const centralSize = centrals.reduce((size, part) => size + part.length, 0);
    const end = join([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(offset), u16(0)]);
    return join([...locals, ...centrals, end]);
  }

  const api = { clamp, slugify, scaledHeight, chooseQuietCut, verifyCuts, outputPath, crc32, zipStore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DetailCutCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

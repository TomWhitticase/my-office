// Off the main thread, so building them never holds up a frame: the portrait on B3 and her face (lisa-portrait.js), posted
// back as ImageBitmaps, and her world's terrain (lisa-land.js landMesh), as arrays. Its own seeded random, so it's the
// same painting every time.

import { paintPortrait, paintFace } from './lisa-portrait.js';
import { landMesh } from './lisa-land.js';

self.onmessage = async ({ data: { seed, w, fw } }) => {
  let s = seed >>> 0 || 1;
  const R = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const portrait = paintPortrait(R, w).transferToImageBitmap();
  const face = paintFace(R, fw).transferToImageBitmap();
  self.postMessage({ portrait, face }, [portrait, face]);
  const land = landMesh();
  self.postMessage({ land }, [land.pos.buffer, land.col.buffer, land.nrm.buffer, land.idx.buffer]);
};

// The grey meadow's heavy arithmetic, off the main thread (floors/cart.js asks; cart-sculpt.js does it): the faces'
// grids and morphs, the skin's maps, the ground's grid and map. Each answer's arrays are transferred, not copied.

import { faceArrays, skinArrays, groundArrays } from './cart-sculpt.js';
import { PEOPLE } from './cart-sculpt.js';

const bufs = (o) => Object.values(o).flatMap((v) => (Array.isArray(v) ? v.map((x) => x.buffer) : v?.buffer ? [v.buffer] : []));
self.onmessage = ({ data: { id, job, a } }) => {
  const out = job === 'face' ? faceArrays(PEOPLE[a.p], a.nU, a.nV, a.morphs) : job === 'skin' ? skinArrays(a.S, PEOPLE[a.p]) : groundArrays();
  self.postMessage({ id, out }, bufs(out));
};

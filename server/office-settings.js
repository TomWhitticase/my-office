// ---------- office settings ----------
// Lights, blinds and the door, set from the Admin tab or by clicking in the office, and the security cameras, set from the
// desktop's Security app; shared by every open browser.
// lights: 'auto' follows daylight, 'on'/'off' override it; brightness scales every lamp. ~/.claude/my-office/office.json.
const fs = require('fs');
const path = require('path');
const { CLAUDE, readJSON, clients } = require('./util');

const OFFICE_FILE = path.join(CLAUDE, 'my-office', 'office.json');
// blinds: side/front are my glass office's, north/east/west the outside windows per wall, office the outside window in my office,
// meetSouth/meetNorth/meetSmall/meetHuddle the meeting rooms' glass. Each is 0 raised, 0.5 lowered with the slats open, 1 closed.
// cameras: { [id]: { on, pan, tilt, zoom } } for those changed from their defaults (on, aimed as built, zoom 1); pan and
// tilt in degrees off that aim (each camera's own limits are the app's; these are the outer bounds).
const OFFICE_DEFAULT = { lights: 'auto', brightness: 1, blinds: { side: 0, front: 0, north: 0, east: 0, west: 0, office: 0, meetSouth: 0, meetNorth: 0, meetSmall: 0, meetHuddle: 0 }, door: 0,
  cameras: {} };
const CAM_ID = /^[a-z0-9-]{1,40}$/, CAM_MAX = 32;
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100 : d);
const camOf = (c, was = {}) => ({ on: typeof c.on === 'boolean' ? c.on : was.on ?? true, pan: num(c.pan, -180, 180, was.pan ?? 0),
  tilt: num(c.tilt, -60, 60, was.tilt ?? 0), zoom: num(c.zoom, 1, 4, was.zoom ?? 1) });
let office = { ...OFFICE_DEFAULT, ...readJSON(OFFICE_FILE) };
office.blinds = { ...OFFICE_DEFAULT.blinds, ...office.blinds };
office.cameras = Object.fromEntries(Object.entries(office.cameras || {}).filter(([id, c]) => CAM_ID.test(id) && c && typeof c === 'object')
  .slice(0, CAM_MAX).map(([id, c]) => [id, camOf(c)]));
function putOffice(b) {
  if (['auto', 'on', 'off'].includes(b.lights)) office.lights = b.lights;
  if (Number.isFinite(b.brightness)) office.brightness = Math.min(2, Math.max(0.1, b.brightness));
  if (b.blinds) for (const k of Object.keys(OFFICE_DEFAULT.blinds)) if (k in b.blinds) office.blinds = { ...office.blinds, [k]: [0, 0.5, 1].includes(b.blinds[k]) ? b.blinds[k] : b.blinds[k] ? 1 : 0 };
  if ('door' in b) office.door = b.door ? 1 : 0;
  if (b.cameras && typeof b.cameras === 'object') {   // a patch per camera: only the fields given change
    const cams = { ...office.cameras };
    for (const [id, c] of Object.entries(b.cameras)) {
      if (!CAM_ID.test(id) || !c || typeof c !== 'object' || (!(id in cams) && Object.keys(cams).length >= CAM_MAX)) continue;
      cams[id] = camOf(c, cams[id]);
    }
    office.cameras = cams;
  }
  fs.mkdirSync(path.dirname(OFFICE_FILE), { recursive: true });
  fs.writeFileSync(OFFICE_FILE, JSON.stringify(office, null, 2));
  const json = JSON.stringify(office);
  for (const res of clients) res.write(`event: office\ndata: ${json}\n\n`);
  return office;
}

module.exports = { office, putOffice };

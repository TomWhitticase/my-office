// ---------- office settings ----------
// Lights, blinds and the door, set from the Admin tab or by clicking in the office; shared by every open browser.
// lights: 'auto' follows daylight, 'on'/'off' override it; brightness scales every lamp. ~/.claude/my-office/office.json.
const fs = require('fs');
const path = require('path');
const { CLAUDE, readJSON, clients } = require('./util');

const OFFICE_FILE = path.join(CLAUDE, 'my-office', 'office.json');
// blinds: side/front are my glass office's, north/east/west the outside windows per wall, office the outside window in my office,
// meetSouth/meetNorth/meetSmall the meeting rooms' glass. Each is 0 raised, 0.5 lowered with the slats open, 1 closed.
const OFFICE_DEFAULT = { lights: 'auto', brightness: 1, blinds: { side: 0, front: 0, north: 0, east: 0, west: 0, office: 0, meetSouth: 0, meetNorth: 0, meetSmall: 0 }, door: 0 };
let office = { ...OFFICE_DEFAULT, ...readJSON(OFFICE_FILE) };
office.blinds = { ...OFFICE_DEFAULT.blinds, ...office.blinds };
function putOffice(b) {
  if (['auto', 'on', 'off'].includes(b.lights)) office.lights = b.lights;
  if (Number.isFinite(b.brightness)) office.brightness = Math.min(2, Math.max(0.1, b.brightness));
  if (b.blinds) for (const k of Object.keys(OFFICE_DEFAULT.blinds)) if (k in b.blinds) office.blinds = { ...office.blinds, [k]: [0, 0.5, 1].includes(b.blinds[k]) ? b.blinds[k] : b.blinds[k] ? 1 : 0 };
  if ('door' in b) office.door = b.door ? 1 : 0;
  fs.mkdirSync(path.dirname(OFFICE_FILE), { recursive: true });
  fs.writeFileSync(OFFICE_FILE, JSON.stringify(office, null, 2));
  const json = JSON.stringify(office);
  for (const res of clients) res.write(`event: office\ndata: ${json}\n\n`);
  return office;
}

module.exports = { office, putOffice };

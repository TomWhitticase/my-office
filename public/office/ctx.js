// @ts-check
// The shared context every part of the office receives, and the registries the parts fill in instead of reaching into
// each other: what runs each frame, what a click on something does and what its hover card says, what you can point at,
// keys, and the minimap. Every registry with an `order` runs lowest first (ties in the order registered), so a part's
// place in the frame doesn't depend on when it was installed.

/**
 * Per-frame work: dt in seconds (capped at 0.05), t seconds since the office mounted, now the frame's timestamp (ms).
 * @typedef {(dt: number, t: number, now: number) => void} FrameFn
 */
/**
 * What you're pointing at: the `userData` of the mesh under the crosshair, read by updateHover (action, door, board,
 * blind, floor, key, drawer, folder, info…), or a seat, a TV or a session.
 * @typedef {{ action?: string, [key: string]: any }} Hover
 */
/**
 * A click action, named by the `action` in the userData of whatever you point at. hover returns the hover card's HTML;
 * click does it.
 * @typedef {{ hover?: (h: Hover) => string, click?: (h: Hover, e: MouseEvent) => void }} Action
 */
/**
 * A floor the lift panel offers (see systems/lifts.js and CLAUDE.md, "Adding a floor"). The office itself is
 * { n: 48, label: 'OFFICE', title: 'Office' }; the others have their own scene, or `y` if they're part of the office's
 * scene (the roof).
 * @typedef {object} Floor
 * @property {number} n                   the floor number: the car panel lists them top first
 * @property {string} label               on the car panel
 * @property {string} title               on the hover card and the arrival toast
 * @property {string} [blurb]             what's there, on the building directory by the lifts (defaults to the title)
 * @property {any} [scene]                its own THREE.Scene, drawn by renderFloor
 * @property {number} [y]                 instead of a scene: that far up in the office's scene
 * @property {{ exposure: number, hemi: number, sky: any, ground: any, env: number, bloom: number, grade: number,
 *   lights: [any, number][], aoSkip1?: boolean }} [look]   how it's lit once you step out of the car
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} [colliders]
 * @property {any[]} [hits]               what you can point at there
 * @property {boolean} [on]               you're on it
 * @property {boolean} [carless]          no lift to arrive by (inside a repo)
 * @property {boolean} [liftGone]         its lift isn't there just now (out in the archive's void): no car to stand in
 * @property {boolean} [fly]              you fly rather than walk
 * @property {any} [sound]                its ambience for sounds.js
 * @property {(z: number) => void} [enter]          you've arrived, in a car at z
 * @property {() => void} [leave]
 * @property {(p: { x: number, z: number, eye?: number }) => void} [bound]   keep p inside it
 * @property {() => void} [map]           draw its minimap
 * @property {(dt: number, t: number) => void} [fx]   per frame while you're on it
 * @property {(ray: any) => Hover | null} [pick]     find what you're pointing at itself
 * @property {(x: number, z: number) => number} [ground]   the floor's height there (steps)
 * @property {any} [lift]                 from ctx.liftShaft(): the shaft and car you arrive by, its door leaves, hall
 * @property {any[]} [leaves]               lantern (ind), call button (callM, callHit) and floor panel
 * @property {any} [ind]
 * @property {any} [callM]
 * @property {any} [callHit]
 * @property {any} [panel]
 * @property {number} [out]               set by renderFloor: how far out of the car's light you are (0-1)
 * @property {any} [composer]             set by renderFloor: its own post-processing (gtao, bloom, grade)
 * @property {any} [gtao]
 * @property {any} [bloom]
 * @property {any} [grade]
 * @property {any} [hemi]
 */
/**
 * A lift car (systems/lifts.js): where it is (floor, between floors while travelling), its doors (doorK 0 shut, 1 open),
 * the sessions it's carrying or fetching, and whether it's yours (player).
 * @typedef {{ z: number, at: { x: number, z: number }, floor: number, goal: number, dir: number, state: string, t: number,
 *   doorK: number, nIn: number, pending: any[], cargo: Set<any>, exits: Set<any>, callers: Set<any>, riders: Set<any>,
 *   player?: boolean, leaves?: any[], ind?: any, panel?: any, [key: string]: any }} Lift
 */
/**
 * The shared context. The core values come from main.js; every part adds what it shares (so any other name is allowed,
 * typed `any`). Values that change are accessors: read them as ctx.x each time, never destructure them.
 * @typedef {{
 *   THREE: any, dash: any, container: HTMLElement, colliders: { minX: number, maxX: number, minZ: number, maxZ: number }[],
 *   toast: (html: string) => void,
 *   renderer: any, scene: any, world: any, camera: any, hud: HTMLElement,
 *   mode: 'idle' | 'intro' | 'free' | 'tv' | 'board' | 'chat' | 'warp' | 'read' | 'outro' | string,
 *   active: boolean, away: Floor | null, state: any, quality: boolean, daylight: number,
 *   FLOORS: Floor[], addFloor: (F: Floor) => void,
 *   onFrame: (fn: FrameFn, order: number) => void, runFrame: FrameFn,
 *   action: (name: string, a: Action) => void, actionOf: (name: string) => Action | undefined,
 *   hoverTargets: (fn: () => any[], order: number) => void, collectTargets: (out: any[]) => any[],
 *   key: (code: string, fn: (e: KeyboardEvent) => boolean | void) => void, onKey: (e: KeyboardEvent) => boolean,
 *   minimap: (fn: (c: CanvasRenderingContext2D, sx: (x: number) => number, sz: (z: number) => number) => void, order: number) => void,
 *   drawMinimap: (c: CanvasRenderingContext2D, sx: (x: number) => number, sz: (z: number) => number) => void,
 *   [name: string]: any,
 * }} OfficeCtx
 */

/**
 * Adds the registries to `base` (main.js's core values) and returns it as the context.
 * @param {object} base
 * @returns {OfficeCtx}
 */
export function createCtx(base) {
  /** @type {any[]} */
  const frames = [], actions = new Map(), targets = [], keys = new Map(), maps = [];
  const add = (list, fn, order) => { list.push({ fn, order }); list.sort((a, b) => a.order - b.order); };
  return /** @type {OfficeCtx} */ (Object.defineProperties(base, Object.getOwnPropertyDescriptors({
    // fn(dt, t, now) once a frame: dt in seconds (capped), t seconds since the office mounted, now the frame's timestamp.
    /** @param {FrameFn} fn @param {number} order */
    onFrame(fn, order) { add(frames, fn, order); },
    /** @type {FrameFn} */
    runFrame(dt, t, now) { for (const f of frames) f.fn(dt, t, now); },
    // A click action, named by the `action` in the userData of whatever you point at: hover(h) returns the hover card's
    // HTML, click(h, e) does it. Either may be left out.
    /** @param {string} name @param {Action} a */
    action(name, a) { actions.set(name, a); },
    /** @param {string} name */
    actionOf: (name) => actions.get(name),
    // fn() returns the office's objects you can point at (on another floor its own `hits` are used instead).
    /** @param {() => any[]} fn @param {number} order */
    hoverTargets(fn, order) { add(targets, fn, order); },
    /** @param {any[]} out */
    collectTargets(out) { for (const t of targets) out.push(...t.fn()); return out; },
    // fn(e) for a keydown with this code while you're walking about; return true if it was handled (nothing after runs).
    /** @param {string} code @param {(e: KeyboardEvent) => boolean | void} fn */
    key(code, fn) { if (!keys.has(code)) keys.set(code, []); keys.get(code).push(fn); },
    /** @param {KeyboardEvent} e */
    onKey(e) { for (const fn of keys.get(e.code) || []) if (fn(e)) return true; return false; },
    // fn(c, sx, sz) draws onto the office's minimap; sx/sz map world x/z to map pixels.
    /** @param {(c: CanvasRenderingContext2D, sx: (x: number) => number, sz: (z: number) => number) => void} fn @param {number} order */
    minimap(fn, order) { add(maps, fn, order); },
    /** @param {CanvasRenderingContext2D} c @param {(x: number) => number} sx @param {(z: number) => number} sz */
    drawMinimap(c, sx, sz) { for (const m of maps) m.fn(c, sx, sz); },
  })));
}

// The shared context every part of the office receives, and the registries the parts fill in instead of reaching into
// each other: what runs each frame, what a click on something does and what its hover card says, what you can point at,
// keys, and the minimap. Every registry with an `order` runs lowest first (ties in the order registered), so a part's
// place in the frame doesn't depend on when it was installed.

export function createCtx(base) {
  const frames = [], actions = new Map(), targets = [], keys = new Map(), maps = [];
  const add = (list, fn, order) => { list.push({ fn, order }); list.sort((a, b) => a.order - b.order); };
  return Object.defineProperties(base, Object.getOwnPropertyDescriptors({
    // fn(dt, t, now) once a frame: dt in seconds (capped), t seconds since the office mounted, now the frame's timestamp.
    onFrame(fn, order) { add(frames, fn, order); },
    runFrame(dt, t, now) { for (const f of frames) f.fn(dt, t, now); },
    // A click action, named by the `action` in the userData of whatever you point at: hover(h) returns the hover card's
    // HTML, click(h, e) does it. Either may be left out.
    action(name, a) { actions.set(name, a); },
    actionOf: (name) => actions.get(name),
    // fn() returns the office's objects you can point at (on another floor its own `hits` are used instead).
    hoverTargets(fn, order) { add(targets, fn, order); },
    collectTargets(out) { for (const t of targets) out.push(...t.fn()); return out; },
    // fn(e) for a keydown with this code while you're walking about; return true if it was handled (nothing after runs).
    key(code, fn) { if (!keys.has(code)) keys.set(code, []); keys.get(code).push(fn); },
    onKey(e) { for (const fn of keys.get(e.code) || []) if (fn(e)) return true; return false; },
    // fn(c, sx, sz) draws onto the office's minimap; sx/sz map world x/z to map pixels.
    minimap(fn, order) { add(maps, fn, order); },
    drawMinimap(c, sx, sz) { for (const m of maps) m.fn(c, sx, sz); },
  }));
}

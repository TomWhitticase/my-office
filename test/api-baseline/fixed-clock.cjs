// Preloaded with `node -r` by snap.mjs: freezes Date.now() and new Date() at FIXED_NOW so /api responses are repeatable.
const T = Number(process.env.FIXED_NOW);
if (T) {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(T); }
    static now() { return T; }
  };
}

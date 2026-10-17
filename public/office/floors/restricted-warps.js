// B3's hidden ways out, on its minimap (floors/restricted.js map()): no marker, only a faint warp in the static where
// each one is, a few metres across, its rows smeared sideways and rippling. Barely there; you'd see it if you looked.
// Where they are: restr.hidden, the registry the worn trails use too (restricted-paths.js), every door found from B3's
// fixed layout, so a doorway shows in rooms not built yet; one with `shown` only while that says so (the stone door
// into Relativity, which turns up after a while).

const R = 13, A = 3;   // map px: the warp's radius (about 3 m), and its widest smear

export function makeWarps(ctx, restr) {
  let n = 0;
  // c: the map's context; noise: this frame's static (drawn over the whole map); at(x, z): B3's own space to map px
  return (c, noise, at) => {
    const { width: W, height: H } = c.canvas, kx = noise.width / W, ky = noise.height / H;
    n++;
    c.save(); c.imageSmoothingEnabled = false;
    restr.hidden.forEach((h, s) => {
      if (h.shown && !h.shown()) return;
      const d = h.find(), [px, pz] = at(d.X, d.Z);
      if (px < -R || px > W + R || pz < -R || pz > H + R) return;
      // the static under it again, each 2 px row pulled sideways a little, the pull rippling through the rows
      for (let r = -R; r < R; r += 2) {
        const f = 1 - (r / R) ** 2, w = R * Math.sqrt(f), sh = A * f * Math.sin(r * 0.45 + n * 0.21 + s * 2.1) * (0.75 + 0.25 * Math.sin(n * 0.053 + s));
        c.globalAlpha = 0.24 * f;
        c.drawImage(noise, (px - w) * kx, (pz + r) * ky, 2 * w * kx, 2 * ky, px - w + sh, pz + r, 2 * w, 2);
      }
    });
    c.restore();
  };
}

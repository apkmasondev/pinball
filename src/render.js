import { W, H, bumpers, targets, slings, clamp } from './physics.js';

const TAU = Math.PI * 2;
// Presentation margin for the external plunger; the physical playfield stays 1040 high.
export const VIEW_H = H + 24;
// Where the painted pivot bolt sits along the flipper bat sprite.
const PIVOT = .171;
// Every sprite the table needs, cut from the delivered sheets by tools/prepare-assets.py.
export const ASSETS = [
  'water-surface.jpg', 'bridge', 'bank-left', 'bank-right', 'bamboo', 'sakura', 'lotus',
  'lantern', 'stone-lantern', 'koi', 'koi2', 'koi-medallion', 'torii', 'medallion',
  'moon-disc', 'apron',
  'shooter-knob', 'sling-left', 'sling-right', 'flipper-left',
  'bumper-lantern', 'bumper-lotus', 'bumper-koi',
  'ins-moon', 'ins-koi', 'lit-sakura', 'lit-lotus-lit', 'lit-ripple',
  'arrow-moon', 'arrow-water', 'rect-torii', 'drop-moon', 'dia-star',
  'post-red', 'post-gold', 'post-clear', 'post-metal', 'rubber',
  'orn-wave', 'orn-cloud', 'orn-cloud2', 'orn-branch', 'dia-swirl', 'flower-gold',
];

const path = (c, pts, close = false) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); if (close) c.closePath(); };
function circle(c, x, y, r, fill, stroke, width = 1) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.lineWidth = width; c.strokeStyle = stroke; c.stroke(); }
}
function text(c, value, x, y, size = 10, color = '#d8c28e', font = 'Georgia, serif', spacing = 0) {
  c.fillStyle = color; c.font = `${size}px ${font}`; c.textAlign = 'center';
  if (!spacing) { c.fillText(value, x, y); return; }
  const glyphs = [...value];
  const total = glyphs.reduce((sum, g) => sum + c.measureText(g).width + spacing, -spacing);
  let cursor = x - total / 2;
  c.textAlign = 'left';
  for (const g of glyphs) { c.fillText(g, cursor, y); cursor += c.measureText(g).width + spacing; }
  c.textAlign = 'center';
}
function petal(c, x, y, size, angle, color = '#f0b6c6') {
  c.save(); c.translate(x, y); c.rotate(angle); c.fillStyle = color;
  c.beginPath(); c.ellipse(0, 0, size * .45, size, .35, 0, TAU); c.fill(); c.restore();
}

// A cached radial falloff. Tinted copies are drawn additively instead of rebuilding a
// CanvasGradient for every lamp on every frame.
const BLOB = 96;
function makeBlob(rgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = BLOB * 2;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(BLOB, BLOB, 0, BLOB, BLOB, BLOB);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(.4, `rgba(${rgb},.34)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, BLOB * 2, BLOB * 2);
  return cv;
}

export class Renderer {
  constructor(canvas, game, assets) {
    this.canvas = canvas; this.c = canvas.getContext('2d', { alpha: true }); this.game = game; this.assets = assets;
    this.t = 0; this.particles = []; this.ripples = []; this.points = []; this.lights = {};
    this.flash = 0; this.flashColor = '230,198,124'; this.shake = 0; this.reducedMotion = false;
    this.banner = null; this.blobs = new Map(); this.dimmed = new Map(); this.shadows = new Map();
    this.captures = new Map();
    this.submerged = new Map(); this.reflections = [];
    this.reflectors = [
      ...bumpers.map((b, i) => ({ id: `bumper${i}`, x: b.x, y: b.y, rgb: '255,219,153' })),
      ...targets.map((p, i) => ({ id: `target${i}`, x: p.x, y: p.y, rgb: i < 3 ? '174,236,211' : '255,190,199' })),
      ...slings.map((p, i) => ({ id: `sling${i}`, x: (p[0][0] + p[2][0]) / 2, y: (p[0][1] + p[2][1]) / 2, rgb: '255,211,163' })),
      { id: 'scoop', x: 291, y: 112, rgb: '255,225,173' },
    ];
    this.static = document.createElement('canvas'); this.static.width = W * 2; this.static.height = H * 2;
    const c = this.static.getContext('2d'); c.scale(2, 2); this.drawBase(c);
    this.sheen = this.makeSheen();
    this.petals = Array.from({ length: 26 }, (_, i) => ({
      x: (i * 97 + 51) % 470 + 45, y: (i * 173) % 980, speed: 7 + i % 7, size: 2 + i % 3, phase: i * 2.4,
    }));
    this.resize();
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
  }

  // The playfield glass: two soft diagonal reflections and a corner vignette, baked
  // once and laid over the finished frame. This is what makes the table read as a
  // lit object under glass rather than as a flat picture.
  makeSheen() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    this.boardPath(c); c.clip();
    c.save(); c.translate(300, 520); c.rotate(-.52); c.translate(-300, -520);
    for (const [y, height, alpha] of [[-180, 190, .05], [230, 90, .028], [640, 150, .022]]) {
      const g = c.createLinearGradient(0, y, 0, y + height);
      g.addColorStop(0, 'rgba(226,240,255,0)');
      g.addColorStop(.5, `rgba(226,240,255,${alpha})`);
      g.addColorStop(1, 'rgba(226,240,255,0)');
      c.fillStyle = g; c.fillRect(-500, y, 1600, height);
    }
    c.restore();
    const corner = c.createRadialGradient(300, 500, 240, 300, 500, 640);
    corner.addColorStop(0, 'rgba(0,0,0,0)'); corner.addColorStop(1, 'rgba(2,6,11,.5)');
    c.fillStyle = corner; c.fillRect(0, 0, W, H);
    return cv;
  }

  // --- drawing helpers -----------------------------------------------------
  pondFish(name) {
    if (this.submerged.has(name)) return this.submerged.get(name);
    const img = this.assets[name], cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#07334145';
    c.fillRect(0, 0, cv.width, cv.height);
    this.submerged.set(name, cv); return cv;
  }
  drawPond(c, active) {
    c.save(); this.boardPath(c); c.clip();
    for (const [name, x, y, w, angle, alpha] of [
      ['koi', 267 + Math.sin(this.t * .15) * 36, 501 + Math.sin(this.t * .24) * 31, 101, -.75 + Math.sin(this.t * .2) * .18, active ? .66 : .5],
      ['koi2', 332 + Math.sin(this.t * .12 + 2) * 28, 670 + Math.cos(this.t * .19) * 19, 70, 2.35 + Math.sin(this.t * .15) * .18, active ? .51 : .37],
    ]) {
      const img = this.pondFish(name), h = w * img.height / img.width;
      c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha = alpha;
      c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
    }
    // Same reflection map as the pond bed, now above the fish and below printed art.
    c.globalAlpha = .12; c.drawImage(this.assets['water-surface'], 0, 0, W, H);
    c.restore();
  }
  collectReflections() {
    return this.reflectors.flatMap(source => {
      const age = this.t - (this.lights[source.id] ?? -10);
      return age >= 0 && age < .34 ? [{ ...source, strength: (1 - age / .34) ** 2 }] : [];
    });
  }
  materialReflections(c) {
    if (!this.reflections.length) return;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const glint = (a, b, light, width, gain) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      if (!length) return;
      const t = clamp(((light.x - a[0]) * dx + (light.y - a[1]) * dy) / (length * length), 0, 1);
      const distance = Math.hypot(a[0] + t * dx - light.x, a[1] + t * dy - light.y);
      if (distance > 118) return;
      const span = 34 / length, lo = Math.max(0, t - span), hi = Math.min(1, t + span);
      const ax = a[0] + lo * dx - 1, ay = a[1] + lo * dy - 1.4;
      const bx = a[0] + hi * dx - 1, by = a[1] + hi * dy - 1.4;
      const g = c.createLinearGradient(ax, ay, bx, by);
      const alpha = light.strength * (1 - distance / 118) * gain;
      g.addColorStop(0, `rgba(${light.rgb},0)`); g.addColorStop(.5, `rgba(${light.rgb},${alpha})`); g.addColorStop(1, `rgba(${light.rgb},0)`);
      path(c, [[ax, ay], [bx, by]]); c.strokeStyle = g; c.lineWidth = width; c.stroke();
    };
    for (const light of this.reflections) {
      this.game.physics.walls.forEach((wall, i) => {
        if (i >= 40 && wall.kind === 'rail') glint([wall.ax, wall.ay], [wall.bx, wall.by], light, 1.8, .8);
      });
      for (const p of slings) for (let j = 0; j < 3; j++) glint(p[j], p[(j + 1) % 3], light, 1.1, .4);
      for (const p of targets) glint([p.x - p.side * 9, p.y - 18], [p.x - p.side * 9, p.y + 18], light, 1, .65);
    }
    c.restore();
  }
  sprite(c, name, cx, cy, w, h, { alpha = 1, rotate = 0, flip = false } = {}) {
    const img = this.assets[name]; if (!img) return;
    const height = h ?? w * img.height / img.width;
    c.save(); c.globalAlpha *= alpha; c.translate(cx, cy);
    if (rotate) c.rotate(rotate);
    if (flip) c.scale(-1, 1);
    c.drawImage(img, -w / 2, -height / 2, w, height); c.restore();
  }
  // A sprite pushed towards night, used for inserts whose lamp is currently off.
  dim(name) {
    if (this.dimmed.has(name)) return this.dimmed.get(name);
    const img = this.assets[name];
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    // Filter the sprite itself: a saturation fill also paints its transparent margin.
    c.filter = 'saturate(.22)'; c.drawImage(img, 0, 0); c.filter = 'none';
    c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .62; c.fillStyle = '#0a1b27';
    c.fillRect(0, 0, cv.width, cv.height);
    this.dimmed.set(name, cv); return cv;
  }
  lamp(c, x, y, r, rgb, alpha = 1) {
    if (alpha <= .004) return;
    if (!this.blobs.has(rgb)) this.blobs.set(rgb, makeBlob(rgb));
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, alpha);
    c.drawImage(this.blobs.get(rgb), x - r, y - r, r * 2, r * 2); c.restore();
  }
  glow(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent'); circle(c, x, y, r, g);
  }
  boardPath(c) {
    c.beginPath(); c.moveTo(23, 251);
    c.bezierCurveTo(13, -42, 587, -42, 587, 251);
    c.lineTo(587, 976); c.lineTo(449, 1016);
    c.quadraticCurveTo(300, 1050, 146, 1016); c.lineTo(23, 822); c.closePath();
  }
  rail(c, ax, ay, bx, by, width = 7, kind = 'metal') {
    const palette = kind === 'rubber' ? ['#240b0d', '#a53e3b', '#ca7770']
      : kind === 'gold' ? ['#0f0b05', '#8a6a2b', '#f2dda0']
        : ['#0a0c0b', '#4c5349', '#b9c2ad'];
    c.lineCap = 'round';
    path(c, [[ax + 2, ay + 4], [bx + 2, by + 4]]); c.strokeStyle = '#0008'; c.lineWidth = width + 4; c.stroke();
    path(c, [[ax, ay], [bx, by]]); c.lineWidth = width + 2.5; c.strokeStyle = palette[0]; c.stroke();
    c.lineWidth = width;
    if (kind === 'rubber') c.strokeStyle = palette[1];
    else {
      const length = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / length, ny = (bx - ax) / length;
      const metal = c.createLinearGradient(ax - nx * width / 2, ay - ny * width / 2, ax + nx * width / 2, ay + ny * width / 2);
      metal.addColorStop(0, palette[0]); metal.addColorStop(.24, palette[1]);
      metal.addColorStop(.42, palette[2]); metal.addColorStop(.58, palette[1]); metal.addColorStop(1, palette[0]);
      c.strokeStyle = metal;
    }
    c.stroke();
    path(c, [[ax - 1, ay - 1.4], [bx - 1, by - 1.4]]);
    c.lineWidth = Math.max(.65, width * (kind === 'rubber' ? .1 : .16)); c.strokeStyle = palette[2]; c.stroke();
  }
  shadow(name) {
    if (this.shadows.has(name)) return this.shadows.get(name);
    const img = this.assets[name], mask = document.createElement('canvas');
    mask.width = img.width; mask.height = img.height;
    const m = mask.getContext('2d'); m.drawImage(img, 0, 0);
    m.globalCompositeOperation = 'source-in'; m.fillStyle = '#000'; m.fillRect(0, 0, mask.width, mask.height);
    const soft = document.createElement('canvas'); soft.width = mask.width; soft.height = mask.height;
    const s = soft.getContext('2d'); s.filter = 'blur(3px)'; s.drawImage(mask, 0, 0);
    this.shadows.set(name, soft); return soft;
  }
  scoop(c, frontOnly = false) {
    c.save();
    if (!frontOnly) {
      c.beginPath(); c.ellipse(293, 116, 27, 20, 0, 0, TAU); c.fillStyle = '#0008'; c.fill();
      const metal = c.createLinearGradient(267, 95, 310, 131);
      metal.addColorStop(0, '#434c4c'); metal.addColorStop(.34, '#c6c8ad');
      metal.addColorStop(.58, '#494d43'); metal.addColorStop(1, '#9a8654');
      c.beginPath(); c.ellipse(291, 112, 25, 19, 0, 0, TAU); c.fillStyle = metal; c.fill();
      const well = c.createLinearGradient(0, 98, 0, 129);
      well.addColorStop(0, '#010306'); well.addColorStop(.65, '#03080c'); well.addColorStop(1, '#183039');
      c.beginPath(); c.ellipse(291, 111, 21.5, 15, 0, 0, TAU); c.fillStyle = well; c.fill();
      c.beginPath(); c.ellipse(291, 107, 19, 10, 0, Math.PI, TAU);
      c.strokeStyle = '#000c'; c.lineWidth = 3; c.stroke();
    }
    // Foreground lip occludes a sinking ball; this is the actual capture opening.
    c.beginPath(); c.ellipse(291, 112, 24, 18, 0, .08, Math.PI - .08);
    c.strokeStyle = '#263031'; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.ellipse(291, 111, 24, 18, 0, .12, Math.PI - .12);
    c.strokeStyle = '#d4c49a'; c.lineWidth = 1.2; c.stroke();
    c.restore();
  }
  chromeBall(c, x, y, r = 9) {
    // Approximate nearby light/material reflections, while preserving a white key light.
    let warmth = 0, lightAngle = -.8;
    for (const [lx, ly] of [[70, 566], [518, 560], [236, 132], [346, 132], [217, 282], [365, 282], [291, 391]]) {
      const d = ((x - lx) ** 2 + (y - ly) ** 2) / (125 ** 2);
      const strength = Math.exp(-d) * .8;
      if (strength > warmth) { warmth = strength; lightAngle = Math.atan2(ly - y, lx - x); }
    }
    const lacquer = clamp(1 - Math.min(Math.abs(x - 72), Math.abs(x - 522)) / 130, 0, 1)
      * clamp((y - 210) / 70, 0, 1) * clamp((780 - y) / 90, 0, 1);
    const rgb = [160 + warmth * 46 + lacquer * 18, 189 + warmth * 5 - lacquer * 26, 204 - warmth * 67 - lacquer * 25].map(Math.round);
    const g = c.createRadialGradient(x - r * .33, y - r * .44, r * .1, x, y, r * 1.1);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.2, '#f4f8f1'); g.addColorStop(.42, `rgb(${rgb.join(',')})`);
    g.addColorStop(.63, '#293e4a'); g.addColorStop(.83, this.game.multiball ? '#a8cddd' : '#b8ccc7'); g.addColorStop(1, '#ece0bb');
    circle(c, x, y, r + 1.2, '#06111ce0');
    circle(c, x, y, r, g, '#f4f8e2', .8);
    if (warmth > .06) {
      c.beginPath(); c.arc(x, y, r * .77, lightAngle - .6, lightAngle + .6);
      c.strokeStyle = `rgba(255,193,106,${warmth * .65})`; c.lineWidth = r * .18; c.stroke();
    }
    if (lacquer > .08) {
      const angle = x < 300 ? Math.PI : 0;
      c.beginPath(); c.arc(x, y, r * .76, angle - .65, angle + .65);
      c.strokeStyle = `rgba(196,72,69,${lacquer * .6})`; c.lineWidth = r * .17; c.stroke();
    }
    for (const light of this.reflections) {
      const strength = light.strength * Math.max(0, 1 - Math.hypot(x - light.x, y - light.y) / 125);
      if (strength < .025) continue;
      const angle = Math.atan2(light.y - y, light.x - x);
      c.beginPath(); c.arc(x, y, r * .73, angle - .45, angle + .45);
      c.strokeStyle = `rgba(${light.rgb},${strength * .85})`; c.lineWidth = r * .2; c.stroke();
    }
    circle(c, x - r * .27, y - r * .47, r * .28, '#ffffff');
    c.beginPath(); c.arc(x, y, r * .72, .4, 1.7); c.lineWidth = .8; c.strokeStyle = '#f7e2bc80'; c.stroke();
  }
  post(c, x, y, kind = 'post-gold', scale = 1) {
    const img = this.assets[kind]; if (!img) return;
    const w = 15 * scale, h = w * img.height / img.width;
    c.save(); c.globalAlpha = .45; c.fillStyle = '#000';
    c.beginPath(); c.ellipse(x + 2, y + 5, w * .55, w * .32, 0, 0, TAU); c.fill(); c.restore();
    this.sprite(c, 'rubber', x, y + 1, w * 1.5);
    c.drawImage(img, x - w / 2, y - h * .78, w, h);
  }
  // Lacquer panel with a gold keyline: the recurring surface of this cabinet.
  lacquer(c, pts, tone = 0) {
    path(c, pts.map(([x, y]) => [x + 2, y + 7]), true); c.fillStyle = '#0008'; c.fill();
    path(c, pts, true);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const g = c.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    g.addColorStop(0, tone ? '#3d0d13' : '#4d1119');
    g.addColorStop(.45, tone ? '#75202a' : '#8a2733');
    g.addColorStop(1, tone ? '#280a10' : '#3a0f16');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3.4; c.strokeStyle = '#c9a35a'; c.stroke();
    c.lineWidth = 1; c.strokeStyle = '#f6e3ae'; c.stroke();
  }

  // Flat gold inlay on the cabinet: no pivot circles, raised rims or false rails.
  // Baked with the static table, so this detail adds no work to the animation loop.
  gardenWing(c, pts, x, y, lower = false, flip = false) {
    this.lacquer(c, pts, lower ? 1 : 0);
    c.save(); path(c, pts, true); c.clip();
    c.translate(x, y); if (flip) c.scale(-1, 1);
    c.lineCap = 'round';
    // A printed botanical decal under the inlay. Real side plastics carry artwork,
    // not bare lacquer; at low alpha this stays flat and cannot read as hardware.
    this.sprite(c, 'sakura', lower ? 6 : 0, lower ? -70 : -86, 96, null, { alpha: .11, rotate: lower ? .5 : -.35 });
    if (lower) this.sprite(c, 'orn-cloud2', 2, 58, 92, null, { alpha: .3 });
    if (lower) {
      // Open, flowing water lines belong to the surface, not to ball guides.
      for (let i = 0; i < 7; i++) {
        const yy = -44 + i * 17;
        c.beginPath(); c.moveTo(-42, yy + 12);
        c.bezierCurveTo(-15, yy - 10, 3, yy + 23, 40, yy - 6);
        c.lineWidth = i % 3 === 0 ? 1.7 : 1;
        c.strokeStyle = i % 3 === 0 ? '#e7cb92b0' : '#e7cb9260'; c.stroke();
      }
    } else {
      // Slender bamboo stems and tapered leaves, drawn as flush lacquer artwork.
      const leaf = (px, py, angle, length) => {
        c.save(); c.translate(px, py); c.rotate(angle);
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(length * .5, -3.8, length, 0);
        c.quadraticCurveTo(length * .4, 2.8, 0, 0); c.fill(); c.restore();
      };
      // Alphas and weights are set for the size the table is actually played at.
      // Tuned at 1:1 they disappeared once the board was scaled down to the window.
      for (const [sx, top, bottom, alpha] of [[-15, -91, 99, .44], [1, -112, 119, .9], [16, -76, 88, .6]]) {
        c.globalAlpha = alpha; c.strokeStyle = '#e7cb92'; c.fillStyle = '#e7cb92';
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(sx, bottom); c.quadraticCurveTo(sx - 3, 0, sx + 5, top); c.stroke();
        for (let j = 0; j < 5; j++) {
          const yy = bottom - 28 - j * 37; if (yy < top + 10) continue;
          path(c, [[sx - 2, yy], [sx + 3, yy - .7]]); c.lineWidth = .7; c.stroke();
          const side = j % 2 ? -1 : 1;
          c.beginPath(); c.moveTo(sx, yy); c.quadraticCurveTo(sx + side * 10, yy - 9, sx + side * 22, yy - 12); c.stroke();
          leaf(sx + side * 7, yy - 6, side > 0 ? -.95 : -2.2, 14);
          leaf(sx + side * 12, yy - 9, side > 0 ? .18 : 2.95, 17);
          leaf(sx + side * 18, yy - 11, side > 0 ? -.65 : -2.5, 11);
        }
      }
      // Gold blossoms give the panel a second motif, so it is not one texture repeated.
      c.globalAlpha = .7; c.fillStyle = '#eed7a2';
      for (const [bx, by, r] of [[-20, -52, 5.2], [22, 6, 4.4], [-12, 64, 4], [18, -104, 3.6]]) {
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * TAU;
          c.beginPath();
          c.ellipse(bx + Math.cos(a) * r * .62, by + Math.sin(a) * r * .62, r * .34, r * .56, a + Math.PI / 2, 0, TAU);
          c.fill();
        }
        circle(c, bx, by, r * .22, '#8a6a2b');
      }
    }
    c.restore();
  }

  // Play polish: a steel ball buffs the clear coat along the routes it actually takes,
  // so a played machine carries pale matte tracks down the shooter lane, round the
  // orbits, through the return lanes and across the drain. Baked into the static
  // layer, so it costs nothing per frame. Kept faint — read as wear, not as dirt.
  ballWear(c, laneOnly = false) {
    const allRuns = [
      [[[553, 936], [553, 640], [553, 300]], 17, .05],          // shooter lane
      [[[120, 434], [108, 344], [116, 256]], 16, .045],         // left orbit
      [[[470, 434], [482, 344], [474, 256]], 16, .04],          // right orbit
      [[[291, 214], [291, 344], [284, 470], [291, 612]], 22, .035], // centre fall
      [[[119, 716], [119, 798], [168, 828]], 14, .05],          // left return
      [[[474, 716], [474, 798], [424, 828]], 14, .05],          // right return
      [[[62, 726], [62, 800], [128, 906]], 13, .04],            // left outlane
      [[[512, 726], [512, 800], [446, 906]], 13, .04],          // right outlane
      [[[196, 792], [236, 828]], 15, .035],                     // off the left sling
      [[[404, 792], [364, 828]], 15, .035],                     // off the right sling
      [[[214, 878], [268, 952], [291, 992]], 17, .05],          // into the drain
      [[[368, 878], [314, 952], [291, 992]], 17, .05],
    ];
    const runs = allRuns.filter((_, i) => laneOnly ? i === 0 : i !== 0);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.filter = 'blur(3.5px)';
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [pts, width, alpha] of runs) {
      c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      c.lineWidth = width; c.strokeStyle = `rgba(206,222,231,${alpha})`; c.stroke();
    }
    // The arc above the bumpers is a single sweep, like the orbit the ball rides.
    if (!laneOnly) {
      c.beginPath(); c.ellipse(305, 250, 258, 201, 0, Math.PI + .12, TAU - .12);
      c.lineWidth = 17; c.strokeStyle = 'rgba(206,222,231,.05)'; c.stroke();
      for (const b of bumpers) {
        c.beginPath(); c.arc(b.x, b.y, b.r + 7, 0, TAU);
        c.lineWidth = 9; c.strokeStyle = 'rgba(206,222,231,.05)'; c.stroke();
      }
    }
    // Fine scuffing inside the busiest tracks, unblurred so it stays crisp.
    c.filter = 'none'; c.globalAlpha = .5;
    for (let i = 0; i < (laneOnly ? 10 : 90); i++) {
      const pick = runs[i % runs.length], pts = pick[0];
      const t = (i * 37 % 100) / 100, seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
      const f = t * (pts.length - 1) - seg;
      const x = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f + ((i * 53) % 13 - 6);
      const y = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f + ((i * 29) % 11 - 5);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + ((i * 17) % 7) - 3, y + ((i * 23) % 9) - 4);
      c.lineWidth = .7; c.strokeStyle = 'rgba(216,230,238,.05)'; c.stroke();
    }
    c.restore();
  }

  // --- the static table ----------------------------------------------------
  drawBase(c) {
    // Cabinet: brushed brass rail, black lacquer bevel, then the playfield bed.
    this.boardPath(c);
    const brass = c.createLinearGradient(0, 0, 600, 1040);
    brass.addColorStop(0, '#6d5526'); brass.addColorStop(.3, '#d9bd7d');
    brass.addColorStop(.52, '#8a6f38'); brass.addColorStop(.78, '#e4cd94'); brass.addColorStop(1, '#5d4720');
    c.fillStyle = brass; c.fill();
    c.strokeStyle = '#05090c'; c.lineWidth = 26; c.stroke();
    c.strokeStyle = brass; c.lineWidth = 11; c.stroke();
    c.strokeStyle = '#11161a'; c.lineWidth = 5; c.stroke();
    c.strokeStyle = '#f0dcab'; c.lineWidth = 1.2; c.stroke();

    c.save(); this.boardPath(c); c.clip();

    // Playfield bed: deep indigo water rather than the old flat teal.
    const bed = c.createLinearGradient(0, 20, 0, 1020);
    bed.addColorStop(0, '#08121f'); bed.addColorStop(.28, '#0d2036');
    bed.addColorStop(.58, '#0a1a2c'); bed.addColorStop(.84, '#08121d'); bed.addColorStop(1, '#050a11');
    c.fillStyle = bed; c.fillRect(0, 0, W, H);

    // One continuous pond surface: no repeated fish, petals or mirrored seams.
    const water = this.assets['water-surface'];
    if (water) {
      c.save(); c.globalAlpha = .88;
      c.drawImage(water, 0, 0, W, H);
      c.restore();
    }
    // Sink the outer thirds into shadow so the ball always reads against the centre.
    const sides = c.createLinearGradient(0, 0, W, 0);
    sides.addColorStop(0, '#040a12ee'); sides.addColorStop(.17, '#040a1255');
    sides.addColorStop(.5, '#04081000'); sides.addColorStop(.83, '#040a1255'); sides.addColorStop(1, '#040a12ee');
    c.fillStyle = sides; c.fillRect(0, 0, W, H);
    const depth = c.createLinearGradient(0, 0, 0, H);
    depth.addColorStop(0, '#02060cd0'); depth.addColorStop(.16, '#02060c30');
    depth.addColorStop(.72, '#02060c30'); depth.addColorStop(1, '#02060cdd');
    c.fillStyle = depth; c.fillRect(0, 0, W, H);

    // Sparse engraved ripples remain subordinate to the natural water reflection.
    for (let i = 0; i < 46; i++) {
      c.beginPath(); const y = 90 + i * 19, off = Math.sin(i * 6.27) * 46;
      c.ellipse(288 + off, y, 34 + (i * 17) % 118, 3 + (i * 7) % 10, 0, 0, Math.PI);
      c.strokeStyle = i % 5 === 0 ? '#9fc6b418' : '#7fb3ab0c'; c.lineWidth = .9; c.stroke();
    }

    // Split the baked pond bed from the transparent scenery/hardware overlay.
    // Fish can now pass UNDER every print and mounting plate, not over them.
    c.restore(); this.pondBase = this.static;
    this.static = document.createElement('canvas'); this.static.width = W * 2; this.static.height = H * 2;
    c = this.static.getContext('2d'); c.scale(2, 2);
    c.save(); this.boardPath(c); c.clip();

    // --- garden scenery, back to front ---
    this.sprite(c, 'bank-left', 74, 668, 140, null, { alpha: .92 });
    this.sprite(c, 'bank-right', 500, 672, 128, null, { alpha: .92, flip: true });
    this.sprite(c, 'bamboo', 72, 322, 78, null, { alpha: .85 });
    this.sprite(c, 'bamboo', 500, 336, 68, null, { alpha: .78, flip: true });
    this.sprite(c, 'sakura', 108, 88, 118, null, { alpha: .92 });
    this.sprite(c, 'sakura', 474, 92, 108, null, { alpha: .9, flip: true });
    this.sprite(c, 'lotus', 214, 462, 58, null, { alpha: .23, flip: true });
    this.sprite(c, 'lotus', 372, 566, 54, null, { alpha: .2 });

    // Decorative wings are painted surfaces, visibly distinct from live hardware.
    this.gardenWing(c, [[38, 258], [98, 232], [104, 492], [44, 520]], 72, 372);
    this.gardenWing(c, [[40, 536], [104, 512], [100, 706], [44, 734]], 72, 626, true);
    this.gardenWing(c, [[500, 250], [546, 266], [546, 492], [498, 474]], 522, 370, false, true);
    this.gardenWing(c, [[498, 512], [546, 506], [544, 700], [498, 678]], 522, 620, true, true);
    this.sprite(c, 'stone-lantern', 72, 556, 48, null, { alpha: .98 });
    this.sprite(c, 'lantern', 520, 552, 44, null, { alpha: .98 });

    // Keep only the painted moon from the old crescent. Its hard rim, red tips
    // and mounting rings falsely suggested another collision surface.
    const moonArt = document.createElement('canvas'); moonArt.width = moonArt.height = 160;
    const moonContext = moonArt.getContext('2d');
    moonContext.drawImage(this.assets['moon-disc'], 0, 0, 160, 156);
    moonContext.globalCompositeOperation = 'destination-in';
    const feather = moonContext.createRadialGradient(80, 72, 46, 80, 72, 74);
    feather.addColorStop(0, '#fff'); feather.addColorStop(.65, '#ffffffe0'); feather.addColorStop(1, '#fff0');
    moonContext.fillStyle = feather; moonContext.fillRect(0, 0, 160, 160);
    // A thin brass bezel around it. Feathered and unframed the disc read as a smear of
    // fog; the ring says "this is a lamp behind glass" without adding a raised edge.
    c.save();
    this.glow(c, 291, 230, 58, '#f0cf8f1c');
    c.globalAlpha = .82; c.drawImage(moonArt, 258, 197, 66, 66);
    c.globalAlpha = 1;
    circle(c, 291, 230, 30, null, '#0b1219', 3.4);
    circle(c, 291, 230, 30, null, '#c9a35a', 1.8);
    circle(c, 291, 230, 26.5, null, '#f6e3ae55', .9);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      circle(c, 291 + Math.cos(a) * 30, 230 + Math.sin(a) * 30, 2.1, '#e3cb92', '#0b1219', .8);
    }
    c.restore();
    // Soft botanical print behind the hardware; no continuous cross-table edge.
    this.sprite(c, 'sakura', 181, 268, 80, null, { alpha: .28, rotate: -.48 });
    this.sprite(c, 'sakura', 406, 260, 72, null, { alpha: .24, flip: true, rotate: .4 });
    this.sprite(c, 'torii', 291, 100, 196, null, { alpha: 1 });
    this.scoop(c);
    this.sprite(c, 'orn-wave', 200, 626, 92, null, { alpha: .5 });
    this.sprite(c, 'orn-wave', 382, 626, 92, null, { alpha: .5, flip: true });
    this.sprite(c, 'orn-cloud', 291, 452, 124, null, { alpha: .42 });
    this.sprite(c, 'orn-cloud2', 96, 196, 92, null, { alpha: .42 });
    this.sprite(c, 'orn-cloud2', 486, 200, 88, null, { alpha: .42, flip: true });
    this.sprite(c, 'orn-cloud2', 291, 668, 120, null, { alpha: .38 });
    // Inlaid lacquer medallion. Without a rim the faint disc read as a stray circular
    // artefact in the water; the brass keyline makes it a deliberate inlay.
    this.sprite(c, 'koi-medallion', 291, 526, 126, null, { alpha: .045 });
    circle(c, 291, 526, 58, null, '#0a121a55', 3);
    circle(c, 291, 526, 58, null, '#c9a35a3d', 1.1);

    // --- inscriptions ---
    ['月', '光', '花'].forEach((s2, i) => text(c, s2, 234 + 55 * i, 172, 13, '#e2c98f70', 'serif'));
    text(c, 'K O I   R U N', 176, 424, 8, '#9fd2bd', 'Georgia, serif', 1.2);
    text(c, 'S A K U R A', 426, 424, 8, '#e5aebd', 'Georgia, serif', 1.2);
    c.save(); c.shadowColor = '#040d14'; c.shadowBlur = 7;
    text(c, 'ZEN', 291, 638, 14, '#dde5cd', 'Georgia, serif', 3);
    text(c, 'F L O W', 291, 655, 7, '#9cbcb1', 'Georgia, serif', 2);
    c.restore();
    // Printed inside the return lane and running with it. Laid horizontally the word
    // ran under the slingshot plastic and lost its first letters.
    for (const x of [108, 480]) {
      c.save(); c.translate(x, 752); c.rotate(-Math.PI / 2);
      text(c, 'RETURN', 0, 2.5, 7, '#cfc08f', 'Georgia, serif', 1); c.restore();
    }
    for (const x of [58, 514]) {
      c.save(); c.translate(x, 778); c.rotate(-Math.PI / 2);
      text(c, 'O U T', 0, 0, 7, '#d18b78', 'Georgia, serif', 1); c.restore();
    }

    this.ballWear(c);

    // --- rails ---
    // The top arc is a single swept path; drawing its forty collision segments
    // individually produced a bumpy chain of capsules.
    const arc = (width, style) => {
      c.beginPath(); c.ellipse(305, 250, 270, 213, 0, Math.PI, TAU);
      c.lineWidth = width; c.strokeStyle = style; c.lineCap = 'round'; c.stroke();
    };
    c.save(); c.translate(2, 7); arc(11, '#000c'); c.restore();
    arc(8.5, '#0a0c0b'); arc(6, '#4c5349');
    c.save(); c.translate(-1, -1.4); arc(1.4, '#b9c2ad'); c.restore();
    this.game.physics.walls.forEach((w, i) => {
      if (i < 40 || w.kind.startsWith('target') || w.kind.startsWith('sling') || w.kind === 'rubber' || w.kind === 'post') return;
      const gold = (w.ax === w.bx && (w.ax === 162 || w.ax === 422)) || (w.ax === 211 && w.ay === 54);
      this.rail(c, w.ax, w.ay, w.bx, w.by, w.r * 2, gold ? 'gold' : 'metal');
    });

    // --- narrow machined target carriers, with recessed slots and captive screws ---
    for (const side of [1, -1]) {
      c.save(); c.translate(side > 0 ? 146.5 : 452, side > 0 ? 512 : 510); c.rotate(side > 0 ? .09 : -.1);
        c.beginPath(); c.roundRect(-13, -74, 30, 156, 3); c.fillStyle = '#0009'; c.fill();
        path(c, [[-11,-78],[11,-78],[15,-73],[15,73],[11,78],[-11,78],[-15,73],[-15,-73]], true);
        const plate = c.createLinearGradient(-15, 0, 15, 0);
        plate.addColorStop(0, '#61685d'); plate.addColorStop(.09, '#242e32');
        plate.addColorStop(.5, '#152329'); plate.addColorStop(.9, '#10181e'); plate.addColorStop(1, '#85774f');
        c.fillStyle = plate; c.fill();
        c.lineWidth = .8; c.strokeStyle = '#928461'; c.stroke();
        for (const y of [-50, 0, 50]) {
          c.beginPath(); c.roundRect(-8.5, y - 19, 17, 38, 2);
          c.fillStyle = '#010609'; c.fill();
          path(c, [[-9,y+19],[-9,y-19],[8,y-19]]); c.strokeStyle = '#03080b'; c.lineWidth = 2; c.stroke();
          path(c, [[-8,y+20],[9,y+20],[9,y-18]]); c.strokeStyle = '#b8b6a34a'; c.lineWidth = .8; c.stroke();
        }
        for (const y of [-70, 70]) {
          circle(c, 1, y + 1, 2.8, '#02080b'); circle(c, 0, y, 2, '#b6b39a', '#283430', .6);
          path(c, [[-1.2,y-.5],[1.2,y+.5]]); c.strokeStyle = '#25302b'; c.lineWidth = .7; c.stroke();
        }
      c.restore();
    }

    // --- slingshot plastics ---
    for (let i = 0; i < 2; i++) {
      const p = slings[i];
      const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      // A raised plastic follows the actual rubber triangle, leaving return lanes clear.
      path(c, p.map(([x, y]) => [x + 3, y + 8]), true); c.fillStyle = '#000b'; c.fill();
      c.save(); path(c, p, true); c.clip();
      c.fillStyle = '#591724'; c.fill();
      // Scaled to cover the collision triangle. The printed plastic has its own
      // triangular alpha, and at the old size only a sliver of it overlapped this
      // triangle, so most of the slingshot showed bare lacquer instead of artwork.
      this.sprite(c, i ? 'sling-right' : 'sling-left', i ? 409 : 190, 730, 210, null, { alpha: .98 });
      const coat = c.createLinearGradient(0, 665, 0, 795);
      coat.addColorStop(0, '#fff0d44a'); coat.addColorStop(.3, '#fff0d406'); coat.addColorStop(1, '#08090e55');
      c.fillStyle = coat; c.fillRect(cx - 100, 650, 200, 160); c.restore();
      path(c, p, true); c.strokeStyle = '#130a0d'; c.lineWidth = 4; c.stroke();
      c.strokeStyle = '#bee3e650'; c.lineWidth = 2.4; c.stroke();
      c.strokeStyle = '#f5e4ba95'; c.lineWidth = .65; c.stroke();
      // A narrow translucent lip catches light along the non-rubber edges only.
      path(c, [p[0], p[1], p[2]]); c.strokeStyle = '#d9eefb66'; c.lineWidth = .9; c.stroke();
      // One rubber ring stretched around all three posts, as on a real slingshot.
      // Only the kicking face is thicker; the other two edges are rubber in the
      // collision model too, so drawing them is honest as well as authentic.
      for (let j = 0; j < 2; j++) {
        const a = p[j], b = p[(j + 1) % 3];
        this.rail(c, a[0], a[1], b[0], b[1], 6.4, 'rubber');
      }
      // The active face and its two end posts are drawn together in the live pass.
      this.post(c, p[1][0], p[1][1], 'post-red', .95);
    }

    // --- posts along the lane guides and orbits ---
    for (const x of [207, 262, 317, 372]) {
      this.post(c, x, 155, 'post-clear', .62); this.post(c, x, 196, 'post-gold', .7);
      this.sprite(c, 'flower-gold', x, 151, 13, null, { alpha: .9 });
    }
    for (const [x, y] of [[162, 224], [162, 393], [422, 224], [422, 393]]) this.post(c, x, y, 'post-gold');
    for (const [x, y] of [[91, 723], [125, 725], [493, 723], [467, 725], [125, 775], [467, 775]]) this.post(c, x, y, 'post-red', .82);
    for (const [x, y] of [[35, 809], [575, 970], [530, 974]]) this.post(c, x, y, 'post-metal', 1.1);

    // --- lower table: the ball drains beneath the garden bridge ---
    // The upper blossom is a separate decoration in this sprite. Show only the
    // bridge scene below its transparent gap, keeping its position and scale.
    // This leaves clear water under BOTH flippers without altering the source art.
    const bridge = this.assets.bridge, bridgeScale = 214 / bridge.width;
    const bridgeTop = Math.round(bridge.height * .455);
    c.save(); c.globalAlpha = .95;
    c.drawImage(bridge, 0, bridgeTop, bridge.width, bridge.height - bridgeTop,
      291 - 107, 928 - bridge.height * bridgeScale / 2 + bridgeTop * bridgeScale,
      214, (bridge.height - bridgeTop) * bridgeScale); c.restore();
    this.glow(c, 291, 946, 86, '#e7b45c1e');
    this.sprite(c, 'orn-branch', 148, 938, 104, null, { alpha: .5 });
    this.sprite(c, 'orn-branch', 436, 938, 104, null, { alpha: .5, flip: true });
    // The outlane corners were the last bare patches on the board.
    this.sprite(c, 'bank-left', 78, 936, 96, null, { alpha: .6 });
    this.sprite(c, 'bank-right', 500, 940, 92, null, { alpha: .6, flip: true });
    this.sprite(c, 'orn-cloud', 84, 866, 78, null, { alpha: .34 });
    this.sprite(c, 'orn-cloud', 498, 870, 74, null, { alpha: .34, flip: true });
    this.sprite(c, 'apron', 291, 1014, 470, null, { alpha: .96 });
    // Instruction cards. The printed windows measure 53 units across, so every line
    // is measured and shrunk to fit inside its card instead of running past the frame.
    const card = (value, x, y, size, color, font = 'Georgia, serif', spacing = .45) => {
      let s = size;
      for (let i = 0; i < 6; i++) {
        c.font = `${s}px ${font}`;
        const width = [...value].reduce((sum, g) => sum + c.measureText(g).width + spacing, -spacing);
        if (width <= 46) break;
        s *= 46 / width;
      }
      text(c, value, x, y, s, color, font, spacing);
    };
    c.save(); c.globalAlpha = .92;
    card('JAPANESE', 221.5, 1005, 6, '#2a1a12');
    card('NIGHT GARDEN', 221.5, 1014, 6, '#2a1a12');
    card('THE MOONLIT COLLECTION', 221.5, 1026, 4, '#4a3020', 'Georgia, serif', .3);
    card('Nº 01 · 三 球', 365.5, 1006, 6.5, '#2a1a12', 'serif', .8);
    card('TRZY KULE', 365.5, 1016, 5.4, '#2a1a12');
    card('PODĄŻAJ ZA ŚWIATŁEM', 365.5, 1027, 4, '#4a3020', 'Georgia, serif', .3);
    c.restore();

    // --- shooter lane ---
    // A continuous lacquer channel with quiet gold printing under the clear coat.
    // No miniature scenic panel competing with the ball's path at the entrance.
    c.save(); c.beginPath(); c.rect(532, 236, 42, 740); c.clip();
    const lane = c.createLinearGradient(532, 0, 574, 0);
    lane.addColorStop(0, '#05090e'); lane.addColorStop(.3, '#141c22');
    lane.addColorStop(.62, '#1b242a'); lane.addColorStop(1, '#070c11');
    c.fillStyle = lane; c.fillRect(532, 236, 42, 740);
    for (let y = 240; y < 976; y += 7) {
      path(c, [[534, y + (y % 21 ? 0 : 1)], [572, y + 2]]);
      c.lineWidth = .7; c.strokeStyle = y % 21 ? '#ffffff06' : '#00000038'; c.stroke();
    }
    // Wear must sit above the channel's opaque lacquer, below its printed details.
    this.ballWear(c, true);
    c.strokeStyle = '#c8ac7160'; c.lineWidth = .85; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 302 + i * 9;
      c.beginPath(); c.moveTo(541, y + 2);
      c.bezierCurveTo(548, y - 4, 558, y + 7, 566, y); c.stroke();
    }
    text(c, '月', 553, 355, 11, '#c8ac718c', 'serif');
    text(c, '光', 553, 374, 11, '#c8ac718c', 'serif');
    // Travel arrows only along the stretch the ball actually runs up.
    for (let y = 420; y < 900; y += 64) {
      path(c, [[546, y + 9], [553, y], [560, y + 9]]);
      c.strokeStyle = '#c8ab6a3a'; c.lineWidth = 1.4; c.stroke();
    }
    c.save(); c.translate(553, 700); c.rotate(-Math.PI / 2);
    text(c, 'MOONLIGHT EXPRESS', 0, 3, 7.5, '#cbb37f', 'Georgia, serif', 1.4); c.restore();
    c.restore();
    // Ball guides: the lane is a channel between two rails, not a painted strip.
    this.rail(c, 532, 240, 532, 974, 5, 'gold');
    this.rail(c, 573, 248, 573, 968, 3.4);

    c.restore();

    // Cabinet bolts on the rail.
    [[29, 275], [29, 610], [29, 804], [581, 275], [581, 620], [581, 962], [158, 1010], [439, 1010]]
      .forEach(([x, y]) => {
        circle(c, x + .8, y + 1.8, 5.5, '#000b');
        const metal = c.createLinearGradient(x - 3, y - 4, x + 3, y + 4);
        metal.addColorStop(0, '#fff1bf'); metal.addColorStop(.4, '#bcaa7a'); metal.addColorStop(.65, '#504e40'); metal.addColorStop(1, '#d4c695');
        circle(c, x, y, 4.6, metal, '#0e120f', 1.2);
        path(c, [[x - 2.4, y - 1], [x + 2.4, y + 1]]); c.lineWidth = 1.2; c.strokeStyle = '#4a5147'; c.stroke();
      });
  }

  // --- events --------------------------------------------------------------
  event(e) {
    if (e.type === 'message' && e.kind === 'start' && this.game.time === 0) {
      this.particles = []; this.ripples = []; this.points = []; this.lights = {};
      this.banner = null; this.flash = 0; this.shake = 0;
      this.recoil = 0;
      this.captures.clear();
    }
    const b = e.ball;
    if (e.type === 'scoop' && b) { this.captures.set(b.id, this.t); b.trail.length = 0; }
    if (e.type === 'kickout' && b) { this.captures.delete(b.id); b.trail.length = 0; this.lights.kickout = this.t; }
    if (e.type === 'points' && !e.label?.startsWith('COMBO ×')) {
      // Refresh repeated labelled awards instead of stacking copies. Combo has its
      // own live readout below; plain point values still pop per hit.
      const twin = e.label && this.points.find(p => p.label === e.label && p.life > .45);
      if (twin) { twin.life = twin.total; twin.x = e.x; twin.y = e.y; }
      else { this.points.push({ ...e, life: 1.2, total: 1.2 }); if (this.points.length > 20) this.points.shift(); }
    }
    if (/bumper|target|sling|lane|scoop|spinner|orbit/.test(e.type) && b) {
      this.lights[e.type] = this.t;
      this.ripples.push({ x: b.x, y: b.y, life: .8, total: .8 });
      for (let i = 0; i < 5; i++) {
        this.particles.push({ x: b.x, y: b.y, vx: Math.cos(i * 2.4 + this.t) * (34 + i * 11), vy: Math.sin(i * 2.4) * 70, life: 1, total: 1, size: 2 + i % 2 });
      }
    }
    // One stable readout, updated in place without replaying its entrance animation.
    if (e.type === 'combo' && e.count >= 2) {
      if (this.banner?.life > 0) {
        this.banner.title = `COMBO ×${e.count}`; this.banner.life = 1.1;
      } else this.banner = { title: `COMBO ×${e.count}`, tone: '#f0d79b', life: 1.1, total: 1.1, startedAt: this.t };
    }
    if (['jackpot', 'multiball', 'extra'].includes(e.type)) {
      this.lights[e.type] = this.t;
      this.flash = 1; this.flashColor = e.type === 'multiball' ? '150,200,255' : '240,205,130';
      this.shake = Math.max(this.shake, e.type === 'multiball' ? 5 : 3);
      this.ripples.push({ x: 291, y: 300, life: 2.5, total: 2.5 });
      for (let i = 0; i < 48; i++) {
        this.particles.push({ x: 291, y: 160, vx: Math.sin(i * 3.4) * 160, vy: Math.cos(i * 5.2) * 190, life: 2 + i % 3, total: 4, size: 2 + i % 4 });
      }
    }
    // The rod is driven forward hard enough to overshoot, then settles.
    if (e.type === 'launch' || e.type === 'autolaunch') this.recoil = 4.5;
    if (e.type === 'replunge') this.recoil = 1.6;
    if (e.type === 'nudge') this.shake = 4;
    if (e.type === 'tilt') { this.flash = .7; this.flashColor = '220,90,70'; this.shake = 7; }
    if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140);
    if (this.ripples.length > 26) this.ripples.shift();
  }

  // --- lit hardware --------------------------------------------------------
  targetMotion(i) {
    const age = this.t - (this.lights[`target${i}`] ?? -10);
    return this.reducedMotion || age < 0 || age > .3 ? 0 : Math.sin(age * 38) * Math.exp(-age * 12);
  }
  targetFace(c, p, i, lit) {
    const motion = this.targetMotion(i), hit = Math.max(0, 1 - (this.t - (this.lights[`target${i}`] ?? -10)) / .24);
    c.save(); c.translate(p.x, p.y);
    // Bracket and spring tang remain fixed as the enamel face leans about its foot.
    c.fillStyle = '#050c10'; c.fillRect(-5, 9, 12, 14);
    c.fillStyle = '#777d6c'; c.fillRect(-2, 12, 4, 9);
    c.fillStyle = '#d1c6a1'; c.fillRect(-2, 12, 1, 8);
    c.save(); c.translate(0, 14); c.rotate(-p.side * motion * .18); c.scale(1 - Math.abs(motion) * .13, 1); c.translate(0, -14);
    c.beginPath(); c.roundRect(-4 + p.side * 2, -13, 11, 29, 2); c.fillStyle = '#000a'; c.fill();
    path(c, [[-6,-15],[6,-15],[8,-12],[8,15],[-4,17],[-6,14]], true);
    const edge = c.createLinearGradient(-6, -15, 8, 15);
    edge.addColorStop(0, '#e4d7ad'); edge.addColorStop(.4, '#747b6e'); edge.addColorStop(.7, '#303b39'); edge.addColorStop(1, '#b4a275');
    c.fillStyle = edge; c.fill();
    c.beginPath(); c.roundRect(-6, -15, 12, 29, 2);
    const enamel = c.createLinearGradient(-6, -15, 6, 14);
    enamel.addColorStop(0, lit ? '#e0e4bd' : i < 3 ? '#74afa0' : '#d29ca7');
    enamel.addColorStop(.3, lit ? '#b6d5b3' : i < 3 ? '#386f66' : '#914e65');
    enamel.addColorStop(1, i < 3 ? '#173d3e' : '#422637');
    c.fillStyle = enamel; c.fill(); c.strokeStyle = '#e1d2a5'; c.lineWidth = .8; c.stroke();
    path(c, [[-4,-12],[-4,10]]); c.strokeStyle = '#fff6d982'; c.lineWidth = 1; c.stroke();
    // Small engraved bands provide scale without adding another icon or label.
    for (const y of [-5, 0, 5]) { path(c, [[-1.5,y],[3,y-1]]); c.strokeStyle = lit ? '#f8e9bd' : '#d4d2b577'; c.lineWidth = .7; c.stroke(); }
    if (hit) { c.fillStyle = `rgba(255,243,204,${hit * .28})`; c.fillRect(-4, -12, 8, 23); }
    c.restore();
    c.fillStyle = '#0b1418'; c.fillRect(-7, 15, 14, 3);
    c.fillStyle = '#a8a58b'; c.fillRect(-6, 15, 12, 1);
    c.restore();
  }
  slingDeflection(i) {
    const age = this.t - (this.lights[`sling${i}`] ?? -10);
    return this.reducedMotion || age < 0 || age > .28 ? 0 : Math.sin(age * 42) * Math.exp(-age * 14) * 5;
  }
  slingRubber(c, i) {
    const [a, inside, b] = slings[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
    if ((inside[0] - a[0]) * nx + (inside[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const bend = this.slingDeflection(i) * 2;
    const stroke = (dx, dy, width, color) => {
      c.beginPath(); c.moveTo(a[0] + dx, a[1] + dy);
      c.quadraticCurveTo((a[0] + b[0]) / 2 + nx * bend + dx, (a[1] + b[1]) / 2 + ny * bend + dy, b[0] + dx, b[1] + dy);
      c.lineWidth = width; c.strokeStyle = color; c.stroke();
    };
    c.save(); c.lineCap = 'round';
    stroke(2, 4, 13, '#0008'); stroke(0, 0, 11.5, '#240b0d');
    stroke(0, 0, 9, '#a53e3b'); stroke(-1, -1.4, .9, '#ca7770'); c.restore();
    // Fixed anchors cover the curved band's ends; only the rubber flexes.
    for (const p of [a, b]) this.post(c, p[0], p[1], 'post-red', .95);
  }
  insert(c, name, x, y, size, lit, rgb, pulse = 0) {
    const img = this.assets[name]; if (!img) return;
    const h = size * img.height / img.width;
    if (!lit) {
      c.drawImage(this.dim(name), x - size / 2, y - h / 2, size, h);
      // A dark lens still catches the room. Without this highlight a switched-off
      // insert reads as a smudge rather than as glass.
      c.save(); c.globalAlpha = .28; c.beginPath();
      c.ellipse(x - size * .16, y - h * .2, size * .22, h * .12, -.6, 0, TAU);
      c.fillStyle = '#d3e4ef'; c.fill(); c.restore();
      return;
    }
    const wave = .82 + Math.sin(this.t * 3.4 + x) * .18 + pulse;
    this.lamp(c, x, y, size * 1.55, rgb, .5 * wave);
    c.drawImage(img, x - size / 2, y - h / 2, size, h);
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .32 * wave;
    c.drawImage(img, x - size / 2, y - h / 2, size, h); c.restore();
  }
  // The plunger keeps a fixed number of coils and packs them tighter as it is pulled,
  // the way a real spring does. Releasing it drives a short damped recoil instead of
  // snapping the rod back to rest in one frame.
  plunger(c, dt) {
    // REST puts the rubber tip against the ball at rest; ANCHOR is the housing the
    // spring pushes off. Travel and free length are chosen so the coils visibly bunch
    // together under full pull instead of collapsing into nothing.
    const TRAVEL = 22, COILS = 8, REST = 938, ANCHOR = 981;
    this.recoil = (this.recoil ?? 0) * Math.exp(-dt * 11);
    const collar = REST + this.game.charge * TRAVEL + Math.sin(this.t * 46) * this.recoil;

    const rod = c.createLinearGradient(548, 0, 558, 0);
    rod.addColorStop(0, '#39423c'); rod.addColorStop(.3, '#aab5a9');
    rod.addColorStop(.5, '#e3eade'); rod.addColorStop(.72, '#78837a'); rod.addColorStop(1, '#2a332e');
    c.fillStyle = rod; c.fillRect(548.5, collar - 4, 9, 76);

    const top = collar + 6, span = Math.max(4, ANCHOR - top);
    c.save(); c.lineCap = 'round';
    for (let i = 0; i <= COILS; i++) {
      const y = top + span * (i / COILS);
      c.beginPath(); c.moveTo(544, y + 2.2); c.quadraticCurveTo(553, y - 2.8, 562, y + 2.2);
      c.lineWidth = 3.4; c.strokeStyle = '#090d10'; c.stroke();
      c.lineWidth = 2.2; c.strokeStyle = '#78847c'; c.stroke();
      c.beginPath(); c.moveTo(545.5, y + 1.4); c.quadraticCurveTo(553, y - 3.2, 560.5, y + 1.4);
      c.lineWidth = .8; c.strokeStyle = '#e2e9dd'; c.stroke();
    }
    c.restore();

    // Collar the spring pushes against, then the rubber tip that meets the ball.
    c.fillStyle = '#20282b'; c.beginPath(); c.roundRect(545, collar - 1, 16, 8, 2); c.fill();
    c.fillStyle = '#5b6a63'; c.fillRect(545, collar - 1, 16, 1.6);
    c.fillStyle = '#8c4237'; c.beginPath(); c.roundRect(547.5, collar - 8, 11, 8, 3); c.fill();
    c.fillStyle = '#b86153'; c.beginPath(); c.roundRect(548.8, collar - 7, 3.2, 5.4, 1.6); c.fill();

    // Where the rod leaves the cabinet: a fixed escutcheon, then the knob outside it.
    c.fillStyle = '#0a1015'; c.beginPath(); c.roundRect(540, ANCHOR - 3, 26, 15, 3); c.fill();
    c.strokeStyle = '#a8863f'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#39423c'; c.fillRect(541.5, ANCHOR - 1.5, 23, 3.5);
    this.sprite(c, 'shooter-knob', 553, collar + 76, 31);
  }
  flipper(c, f, right) {
    const img = this.assets['flipper-left']; if (!img) return;
    // The painted bolt sits 17.1% along the bat, so the sprite is scaled to put its far
    // cap on the collision tip. The right bat reuses the same art: its rest angle is
    // already past 180°, so one vertical flip in local space lands the koi upright.
    // Height is tied to the collision radius, not to the sprite's own proportions: at
    // 34 units the painted bat overhung its capsule by 4 on each side and the ball
    // visibly sank into the artwork when it came to rest on a flipper.
    const w = (f.length + f.radius) / (1 - PIVOT), h = f.radius * 2 + 2;
    // Offset in table coordinates BEFORE rotation: both bats share one light source.
    c.save(); c.translate(f.x + 2, f.y + 4); c.rotate(f.angle);
    if (right) c.scale(1, -1);
    c.globalAlpha = .58; c.drawImage(this.shadow('flipper-left'), -w * PIVOT, -h / 2, w, h); c.restore();
    c.save(); c.translate(f.x, f.y); c.rotate(f.angle);
    if (right) c.scale(1, -1);
    c.drawImage(img, -w * PIVOT, -h / 2, w, h);
    c.restore();
    circle(c, f.x, f.y, 6.5, '#0006');
  }

  draw(dt) {
    this.t += dt;
    const c = this.c, game = this.game, playing = game.state === 'playing';
    const multiball = game.multiball, koiRun = game.koiUntil > game.time, attract = game.state === 'attract';
    c.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / VIEW_H, 0, 0);
    c.clearRect(0, 0, W, VIEW_H);
    c.save();
    if (this.shake > .1 && !this.reducedMotion) {
      c.translate(Math.sin(this.t * 78) * this.shake, Math.cos(this.t * 61) * this.shake * .4);
    }
    this.shake *= Math.exp(-dt * 9);
    this.reflections = this.collectReflections();
    c.drawImage(this.pondBase, 0, 0, W, H);
    this.drawPond(c, koiRun);
    c.drawImage(this.static, 0, 0, W, H);

    // --- the lamp pass: every real light source on the table ---
    const breath = .86 + Math.sin(this.t * 1.3) * .14;
    this.lamp(c, 70, 566, 58, '255,176,72', .3 * breath);
    this.lamp(c, 518, 560, 52, '255,176,72', .28 * (1.72 - breath));
    this.lamp(c, 236, 132, 44, '255,150,86', .26 * breath);
    this.lamp(c, 346, 132, 44, '255,150,86', .26 * (1.72 - breath));
    this.lamp(c, 291, 88, 92, '255,233,176', (multiball ? .36 : .22) * breath);
    this.lamp(c, 291, 430, 190, multiball ? '122,178,255' : '120,168,150', multiball ? .2 : .07);
    if (koiRun) this.lamp(c, 291, 560, 210, '120,226,196', .11 + Math.sin(this.t * 4) * .03);
    this.lamp(c, 291, 944, 66, '255,190,96', .18 + Math.sin(this.t * .9) * .05);
    const chase = this.t - (this.lights.multiball ?? -10);
    if (chase < 3.2) {
      [[70,566], [518,560], [236,132], [346,132], [291,88]].forEach(([x,y], i) => {
        const pulse = Math.max(0, 1 - Math.abs(chase - .18 * i - .35) / .65);
        this.lamp(c, x, y, 76, '170,213,255', pulse * .65);
      });
    }

    // --- inserts ---
    [234, 289, 344].forEach((x, i) => {
      const lit = game.moon[i] || (attract && Math.sin(this.t * 1.6 + i * 1.1) > .55);
      this.insert(c, 'ins-moon', x, 193, 25, lit, '244,224,160');
    });
    const orbitReady = !multiball && game.moon.filter(Boolean).length < 3;
    this.insert(c, 'arrow-moon', 106, 400, 30, orbitReady || attract, '180,220,255');
    this.insert(c, 'arrow-water', 490, 400, 30, orbitReady || attract, '180,220,255');
    const jackpotPulse = multiball ? Math.max(0, .35 - (this.t - (this.lights.scoop ?? -9)) * .7) : 0;
    for (const x of [246, 338]) this.insert(c, 'rect-torii', x, 150, 22, multiball || attract, '255,170,120', jackpotPulse);
    targets.forEach((p, i) => {
      // In attract the banks run a chase, the way a machine idles between games.
      const lit = attract ? Math.sin(this.t * 2.4 - i * .8) > .35 : i < 3 ? game.koi[i] : game.sakura[i - 3];
      const hit = this.t - (this.lights[`target${i}`] ?? -10) < .24;
      this.targetFace(c, p, i, lit);
      if (lit || hit) this.lamp(c, p.x, p.y, 29, i < 3 ? '140,235,200' : '255,160,190', hit ? .32 : .18);
      this.insert(c, i < 3 ? 'ins-koi' : 'lit-sakura', p.x + p.side * 26, p.y, 23, lit, i < 3 ? '140,225,195' : '255,165,195');
    });
    const saveLit = game.time < game.saveUntil || (attract && Math.sin(this.t * 1.1) > .1);
    this.insert(c, 'drop-moon', 119, 786, 18, saveLit, '250,220,150');
    this.insert(c, 'drop-moon', 474, 786, 18, saveLit, '250,220,150');
    this.insert(c, game.tilted ? 'dia-star' : 'lit-lotus-lit', 291, 792, game.tilted ? 30 : 34, saveLit || game.tilted,
      game.tilted ? '255,110,90' : '150,235,170');
    text(c, game.tilted ? 'T I L T' : 'B A L L   S A V E', 291, 820, 7, game.tilted ? '#ffa48c' : '#d5d7a8', 'Georgia, serif', 1);
    this.insert(c, 'lit-ripple', 291, 344, 26, game.hits % 12 >= 8 || multiball || attract, '255,214,130');

    // --- bumpers ---
    const caps = ['bumper-lantern', 'bumper-koi', 'bumper-lotus'];
    bumpers.forEach((b, i) => {
      const idle = attract ? Math.max(0, Math.sin(this.t * 2.2 - i * 2.1)) * .35 : 0;
      const impact = Math.max(0, 1 - (this.t - (this.lights[`bumper${i}`] ?? -10)) / .28);
      this.lamp(c, b.x, b.y, 62 + (impact + idle) * 16, '255,186,104', .22 + impact * .3 + idle);
      circle(c, b.x + 2, b.y + 9, 37, '#000a');
      circle(c, b.x, b.y, 36.5, '#12060a');
      this.sprite(c, caps[i], b.x, b.y - 2 - impact * 3, 78);
      if (impact) {
        circle(c, b.x, b.y, 36.5, null, `rgba(255,229,166,${impact * .65})`, 1.4);
        this.lamp(c, b.x, b.y, 46, '255,245,215', impact * .35);
      }
    });

    // --- slingshot rubber flash ---
    for (const i of [0, 1]) {
      this.slingRubber(c, i);
      const hit = 1 - (this.t - (this.lights[`sling${i}`] ?? -10)) / .28;
      if (hit > 0) {
        path(c, slings[i], true); c.fillStyle = `rgba(255,196,152,${hit * .26})`; c.fill();
        const p = slings[i];
        this.lamp(c, (p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, 54, '255,180,130', hit * .5);
      }
    }

    // --- spinner ---
    this.rail(c, 262, 598, 330, 598, 3, 'gold');
    const spin = Math.abs(Math.cos(game.physics.spinnerAngle));
    c.save(); c.translate(296, 598); c.scale(1, .16 + spin * .84);
    c.beginPath(); c.roundRect(-13, -18, 26, 36, 5);
    const leaf = c.createLinearGradient(-13, -18, 13, 18);
    leaf.addColorStop(0, '#d9c88c'); leaf.addColorStop(.5, '#8fa08c'); leaf.addColorStop(1, '#e6dcb0');
    c.fillStyle = leaf; c.fill(); c.strokeStyle = '#f4ecc2'; c.lineWidth = 1.2; c.stroke();
    text(c, '葉', 0, 6, 15, '#1f3f38', 'serif'); c.restore();
    const spinning = Math.abs(game.physics.spinnerSpeed);
    if (spinning > 3) this.lamp(c, 296, 598, 44, '210,235,190', Math.min(.45, spinning / 90));
    for (const x of [248, 344]) this.insert(c, 'dia-swirl', x, 598, 20, spinning > 3 || attract, '150,205,235');

    // --- flippers and plunger ---
    for (let i = 0; i < game.physics.flippers.length; i++) this.flipper(c, game.physics.flippers[i], i === 1);
    this.plunger(c, dt);
    this.materialReflections(c);

    // --- ambience ---
    if (!this.reducedMotion) {
      for (const p of this.petals) {
        const y = (p.y + this.t * p.speed) % 966 + 28;
        const x = p.x + Math.sin(this.t * .3 + p.phase) * 18;
        c.globalAlpha = .4; petal(c, x, y, p.size, this.t * .3 + p.phase);
      }
      c.globalAlpha = 1;
    }
    for (const r of this.ripples) {
      r.life -= dt; if (r.life <= 0) continue;
      const age = 1 - r.life / r.total;
      c.beginPath(); c.ellipse(r.x, r.y, 10 + age * 96, 5 + age * 44, 0, 0, TAU);
      c.strokeStyle = `rgba(214,232,196,${(1 - age) * .42})`; c.lineWidth = 1.2; c.stroke();
    }
    this.ripples = this.ripples.filter(r => r.life > 0);
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 22;
      if (!this.reducedMotion) { c.globalAlpha = clamp(p.life / p.total, 0, .85); petal(c, p.x, p.y, p.size, this.t + p.x); }
    }
    c.globalAlpha = 1; this.particles = this.particles.filter(p => p.life > 0);

    // --- score pops and banners ---
    for (const p of this.points) {
      p.life -= dt; if (p.life <= 0) continue;
      c.globalAlpha = Math.min(1, p.life * 2.2);
      c.shadowColor = '#00121f'; c.shadowBlur = 5;
      text(c, p.label || `+${p.value.toLocaleString('pl-PL')}`, p.x, p.y - 18 - (p.total - p.life) * 30,
        p.label ? 13 : 11.5, p.label ? '#ffe9b4' : '#f4dda2', 'Georgia, serif', p.label ? 1.2 : 0);
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1; this.points = this.points.filter(p => p.life > 0);

    if (this.banner) {
      const b = this.banner; b.life -= dt;
      if (b.life <= 0) this.banner = null;
      else {
        const age = this.t - b.startedAt;
        const scale = this.reducedMotion ? 1 : 1 + (1 - Math.min(1, age * 5)) * .12;
        c.save(); c.globalAlpha = Math.min(1, b.life * 2.5);
        c.translate(291, 699); c.scale(scale, scale);
        this.lamp(c, 0, 0, 80, this.flashColor, .16);
        c.shadowColor = '#000d'; c.shadowBlur = 14;
        text(c, b.title, 0, 0, 17, b.tone, 'Georgia, serif', 1.5);
        if (b.subtitle) text(c, b.subtitle, 0, 32, 22, b.tone, 'Georgia, serif', 6);
        c.restore();
      }
    }

    if (this.flash > 0) {
      this.lamp(c, 291, 180, 280, this.flashColor, this.flash * .25);
      this.flash = Math.max(0, this.flash - dt * .8);
    }
    c.drawImage(this.sheen, 0, 0, W, H);
    // Chrome stays above glass reflections, score pops and celebration light.
    const balls = attract ? [{ x: 553, y: 929, vx: 0, vy: 0, trail: [] }] : game.physics.balls;
    for (const b of balls) {
      if (b.captured > 0) {
        const age = (this.t - (this.captures.get(b.id) ?? -10)) / .18;
        if (age >= 0 && age < 1) {
          c.save(); c.beginPath(); c.ellipse(291, 111, 21.5, 15, 0, 0, TAU); c.clip();
          c.globalAlpha = 1 - age * .75;
          this.chromeBall(c, 291, 112 + age * 10, 9 * (1 - age * .65)); c.restore();
        }
        continue;
      }
      if (playing) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 9) b.trail.shift(); }
      if (Math.hypot(b.vx, b.vy) > 460 && !this.reducedMotion) {
        c.beginPath(); b.trail.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
        c.strokeStyle = game.combo > 1 ? '#f2d79c60' : '#cfe8e733'; c.lineWidth = 5.5; c.lineCap = 'round'; c.stroke();
      }
      this.lamp(c, b.x, b.y, 30, '190,220,235', .18);
      c.beginPath(); c.ellipse(b.x + 1.5, b.y + 3.2, 9.8, 7.2, 0, 0, TAU); c.fillStyle = '#0009'; c.fill();
      this.chromeBall(c, b.x, b.y);
    }
    if (balls.some(b => b.captured > 0)) this.scoop(c, true);
    c.restore();
  }
}

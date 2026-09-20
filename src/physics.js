export const W = 600, H = 1040, STEP = 1 / 240, BALL_R = 9;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const bumpers = [{ x: 217, y: 282, r: 34 }, { x: 365, y: 282, r: 34 }, { x: 291, y: 391, r: 34 }];
export const targets = [
  { x: 151, y: 462, side: 1 }, { x: 146, y: 512, side: 1 }, { x: 142, y: 562, side: 1 },
  { x: 447, y: 460, side: -1 }, { x: 452, y: 510, side: -1 }, { x: 457, y: 560, side: -1 },
];
export const slings = [[[142, 665], [149, 755], [233, 790]], [[458, 665], [451, 755], [367, 790]]];
export function nearest(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { x: ax + t * dx, y: ay + t * dy, t };
}
export function makeWalls() {
  const walls = [];
  const add = (a, b, kind = 'rail', r = 3) => walls.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], kind, r });
  let prev = [35, 250];
  for (let i = 1; i <= 40; i++) {
    const a = Math.PI + i / 40 * Math.PI;
    const p = [305 + 270 * Math.cos(a), 250 + 213 * Math.sin(a)];
    add(prev, p); prev = p;
  }
  add([35, 250], [35, 809]); add([35, 809], [155, 985]);
  add([575, 250], [575, 970]); add([530, 235], [530, 974]); add([530, 974], [575, 974]);
  // Upper return deflector turns the shooter arc into the rollover bank.
  add([211, 54], [163, 145], 'rail', 4);
  add([524, 803], [435, 985]);
  // Separated inlanes/outlanes feed the flipper pivots without invisible funnels.
  add([91, 723], [91, 800]); add([91, 800], [185, 832]);
  add([125, 725], [125, 775]);
  add([493, 723], [493, 800]); add([493, 800], [415, 832]);
  add([467, 725], [467, 775]);
  // Upper orbit guides. Ends are round posts, not closed pockets.
  for (const x of [162, 422]) add([x, 224], [x, 393]);
  for (const x of [207, 262, 317, 372]) add([x, 151], [x, 198], 'post', 5);
  slings.forEach((points, i) => points.forEach((p, j) => add(p, points[(j + 1) % 3], j === 2 ? `sling${i}` : 'rubber', 5)));
  targets.forEach((p, i) => add([p.x, p.y - 14], [p.x, p.y + 14], `target${i}`, 5));
  return walls;
}
export class Flipper {
  constructor(right = false) {
    this.x = right ? 415 : 185; this.y = 850; this.right = right;
    this.rest = right ? Math.PI - .40 : .40;
    this.active = right ? Math.PI + .48 : -.48;
    this.angle = this.rest; this.omega = 0; this.length = 88; this.radius = 13;
    this.inertia = 24000; this.coil = 0;
  }
  step(dt, held) {
    this.coil += ((held ? 1 : 0) - this.coil) * Math.min(1, dt / .012);
    const goal = this.rest + (this.active - this.rest) * this.coil;
    const k = held ? 1850 : 450;
    this.omega += clamp((goal - this.angle) * k - this.omega * (held ? 49 : 29), -650, 650) * dt;
    this.omega = clamp(this.omega, -21, 21);
    this.angle += this.omega * dt;
    const lo = Math.min(this.rest, this.active), hi = Math.max(this.rest, this.active);
    if (this.angle < lo || this.angle > hi) { this.angle = clamp(this.angle, lo, hi); this.omega *= -.08; }
  }
  get tip() { return { x: this.x + Math.cos(this.angle) * this.length, y: this.y + Math.sin(this.angle) * this.length }; }
}
let ballId = 0;
export class Ball {
  constructor(x = 552, y = 929) {
    this.id = ++ballId; this.x = this.px = x; this.y = this.py = y; this.vx = 0; this.vy = 0;
    this.r = BALL_R; this.spin = 0; this.rotation = 0; this.cooldowns = {}; this.trail = [];
    this.shooter = x > 530; this.ready = this.shooter; this.captured = 0;
    this.orbit = null; this.stuck = 0; this.life = 0; this.skill = false;
  }
}
export class Physics {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent; this.balls = []; this.walls = makeWalls(); this.flippers = [new Flipper(), new Flipper(true)];
    this.time = 0; this.spinnerAngle = 0; this.spinnerSpeed = 0; this.powered = true;
  }
  addBall(x, y) { const ball = new Ball(x, y); this.balls.push(ball); return ball; }
  emit(b, id, duration, data) {
    if ((b.cooldowns[id] || 0) > this.time) return false;
    b.cooldowns[id] = this.time + duration; this.onEvent({ type: id, ball: b, ...data }); return true;
  }
  launch(power = .7) {
    const ball = this.balls.find(b => b.ready);
    if (!ball) return false;
    ball.ready = false; ball.vy = -(980 + clamp(power, 0, 1) * 460); ball.skill = true;
    this.onEvent({ type: 'launch', ball, power }); return true;
  }
  contact(b, ax, ay, bx, by, radius, restitution = .6, flipper = null) {
    const p = nearest(b.x, b.y, ax, ay, bx, by), dx = b.x - p.x, dy = b.y - p.y;
    const d = Math.hypot(dx, dy), overlap = b.r + radius - d;
    if (overlap <= 0) return null;
    const nx = d > .0001 ? dx / d : 0, ny = d > .0001 ? dy / d : -1;
    b.x += nx * (overlap + .015); b.y += ny * (overlap + .015);
    const rx = flipper ? p.x - flipper.x : 0, ry = flipper ? p.y - flipper.y : 0;
    const sx = flipper ? -flipper.omega * ry : 0, sy = flipper ? flipper.omega * rx : 0;
    const vn = (b.vx - sx) * nx + (b.vy - sy) * ny;
    if (vn >= 0) return null;
    const lever = rx * ny - ry * nx;
    const inverseMass = 1 + (flipper ? lever * lever / flipper.inertia : 0);
    const impulse = -(1 + restitution / (1 + Math.abs(vn) / 2300)) * vn / inverseMass;
    b.vx += impulse * nx; b.vy += impulse * ny;
    if (flipper) flipper.omega -= lever * impulse / flipper.inertia;
    const vt = (b.vx - sx) * -ny + (b.vy - sy) * nx - b.spin * b.r;
    const friction = clamp(-vt * (flipper ? .19 : .065), -impulse * .24, impulse * .24);
    b.vx -= friction * ny; b.vy += friction * nx; b.spin -= friction / (b.r * 2);
    return { nx, ny, speed: -vn, x: p.x, y: p.y };
  }
  step(dt, input = {}) {
    this.time += dt;
    this.flippers[0].step(dt, input.left); this.flippers[1].step(dt, input.right);
    this.spinnerAngle += this.spinnerSpeed * dt; this.spinnerSpeed *= Math.exp(-2.2 * dt);
    for (const b of [...this.balls]) {
      b.px = b.x; b.py = b.y; b.life += dt;
      if (b.ready) continue;
      if (b.captured > 0) {
        b.captured -= dt;
        if (b.captured <= 0) { b.captured = 0; b.y = 140; b.vx = 160; b.vy = 420; b.cooldowns.scoop = this.time + 2; this.onEvent({ type: 'kickout', ball: b }); }
        continue;
      }
      b.vy += 520 * dt;
      const drag = Math.exp(-.085 * dt); b.vx *= drag; b.vy *= drag; b.spin *= Math.exp(-.3 * dt);
      const speed = Math.hypot(b.vx, b.vy); if (speed > 1800) { b.vx *= 1800 / speed; b.vy *= 1800 / speed; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.rotation += b.spin * dt;
      if (b.shooter && b.x < 518) b.shooter = false;
      if (!b.shooter && b.x > 542 && b.y > 250) { b.shooter = true; b.returned = true; }
      // A weak plunge genuinely falls back down the lane, ready for another attempt.
      if (b.shooter && b.x > 530 && b.y > 929 && b.vy > 0) {
        b.y = 929; b.vx = 0;
        if (b.returned) { b.returned = false; b.vy = -1230; this.onEvent({ type: 'autolaunch', ball: b }); }
        else { b.vy = 0; b.ready = true; this.onEvent({ type: 'replunge', ball: b }); }
      }
      for (let pass = 0; pass < 2; pass++) {
        for (const wall of this.walls) {
          const hit = this.contact(b, wall.ax, wall.ay, wall.bx, wall.by, wall.r, wall.kind === 'rail' ? .43 : .68);
          if (!hit || pass > 0) continue;
          if (this.powered && wall.kind.startsWith('sling') && hit.speed > 35 && this.emit(b, wall.kind, .24, hit)) {
            b.vx += hit.nx * 270; b.vy += hit.ny * 270;
          } else if (wall.kind.startsWith('target') && hit.speed > 28) this.emit(b, wall.kind, .4, hit);
          else if (hit.speed > 160) this.emit(b, 'wall', .09, hit);
        }
        for (let i = 0; i < bumpers.length; i++) {
          const p = bumpers[i], hit = this.contact(b, p.x, p.y, p.x, p.y, p.r, .85);
          if (this.powered && hit && pass === 0 && this.emit(b, `bumper${i}`, .12, hit)) {
            const current = b.vx * hit.nx + b.vy * hit.ny;
            const kick = Math.max(0, 480 - current); b.vx += hit.nx * kick; b.vy += hit.ny * kick;
          }
        }
        for (const f of this.flippers) {
          const tip = f.tip, hit = this.contact(b, f.x, f.y, tip.x, tip.y, f.radius, .72, f);
          if (hit && hit.speed > 80) this.emit(b, 'flipper', .1, hit);
        }
      }
      // Switches fire on crossing, with per-ball debounce; resting on one cannot farm points.
      if (b.py < 202 && b.y >= 202 && b.vy > 0 && b.x > 207 && b.x < 372) {
        this.emit(b, 'lane', .7, { index: clamp(Math.floor((b.x - 207) / 55), 0, 2) });
      }
      if (b.py > 433 && b.y <= 433 && (b.x < 151 || (b.x > 440 && b.x < 518))) {
        b.orbit = { side: b.x < 151 ? 'left' : 'right', start: this.time, top: false };
      }
      if (b.orbit && b.y < 230) b.orbit.top = true;
      if (b.orbit && b.y > 437 && b.vy > 0) {
        if (b.orbit.top && this.time - b.orbit.start < 7) this.emit(b, 'orbit', 1, { side: b.orbit.side });
        b.orbit = null;
      }
      if (b.py < 786 && b.y >= 786 && ((b.x > 102 && b.x < 136) || (b.x > 465 && b.x < 483))) this.emit(b, 'inlane', 2, { index: b.x < 300 ? 0 : 1 });
      if ((b.py - 598) * (b.y - 598) < 0 && b.x > 266 && b.x < 326) {
        if (this.emit(b, 'spinner', .25, { x: b.x, y: b.y })) this.spinnerSpeed += clamp(b.vy / 22, -45, 45);
      }
      if (Math.hypot(b.x - 291, b.y - 112) < 23 && !b.shooter && (b.cooldowns.scoop || 0) < this.time) {
        b.x = 291; b.y = 112; b.vx = b.vy = 0; b.captured = 1.1; this.emit(b, 'scoop', 2, { x: 291, y: 112 });
      }
      // Mechanical ball search applies a small impulse after a sustained stall.
      b.stuck = !b.ready && !b.captured && Math.hypot(b.vx, b.vy) < 10 ? b.stuck + dt : 0;
      if (b.stuck > 2.5) { b.vx += b.x < 300 ? 160 : -160; b.vy -= 260; b.stuck = 0; this.onEvent({ type: 'search', ball: b }); }
      if (b.y > 1004 || b.x < -30 || b.x > 630 || b.y < -40 || !Number.isFinite(b.x + b.y)) {
        this.balls = this.balls.filter(v => v !== b); this.onEvent({ type: 'drain', ball: b });
      }
    }
    for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
      const a = this.balls[i], b = this.balls[j];
      if (a.ready || b.ready || a.captured || b.captured) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 18) continue;
      const nx = d > .0001 ? dx / d : 1, ny = d > .0001 ? dy / d : 0, overlap = (18 - d) / 2 + .01;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const v = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (v < 0) { a.vx += v * .93 * nx; a.vy += v * .93 * ny; b.vx -= v * .93 * nx; b.vy -= v * .93 * ny; }
    }
  }
}

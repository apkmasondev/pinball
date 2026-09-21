import { Physics, STEP, clamp } from './physics.js';
import { GardenModes } from './garden-modes.js';
export class Game {
  constructor(onEvent = () => {}) {
    this.notify = onEvent; this.physics = new Physics(e => this.handle(e)); this.state = 'attract';
    this.input = { left: false, right: false }; this.accumulator = 0; this.time = 0; this.highScore = 0;
    this.resetStats();
  }
  resetStats() {
    this.garden = new GardenModes(this);
    this.score = 0; this.ballNumber = 1; this.multiplier = 1; this.combo = 0; this.lastShot = ''; this.comboUntil = 0;
    this.moon = [false, false, false]; this.koi = [false, false, false]; this.sakura = [false, false, false];
    this.hits = 0; this.bonus = 0; this.saveUntil = 0; this.multiball = false; this.jackpots = 0; this.extraBalls = 0;
    this.extraEarned = false; this.tilt = 0; this.tilted = false; this.nextBallAt = 0; this.koiUntil = 0;
    this.lockCount = 0; this.pending = []; this.charge = 0; this.charging = false; this.lastNudge = -10;
    this.stats = { bumpers: 0, targets: 0, orbits: 0, saves: 0, jackpots: 0, launches: 0, searches: 0 };
  }
  start() {
    this.resetStats(); this.physics = new Physics(e => this.handle(e)); this.time = 0; this.accumulator = 0;
    this.state = 'playing'; this.input.left = this.input.right = false; this.physics.addBall();
    this.notify({ type: 'reset' });
    this.message('OGRÓD BUDZI SIĘ', 'Przytrzymaj SPACJĘ i puść, aby wystrzelić', 'start');
  }
  message(title, subtitle = '', kind = 'event') { this.notify({ type: 'message', title, subtitle, kind }); }
  pause() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = this.state === 'paused' ? 'playing' : 'paused';
    this.input.left = this.input.right = false; this.charging = false; this.charge = 0; this.accumulator = 0;
    this.notify({ type: 'state' });
  }
  setFlipper(side, pressed) {
    if (this.state !== 'playing' || this.tilted) return;
    if (pressed && !this.input[side]) {
      this.notify({ type: 'flipperPress', side });
      // Lane change rotates the lit moon inserts as on a physical machine.
      if (side === 'left') this.moon.push(this.moon.shift()); else this.moon.unshift(this.moon.pop());
    }
    this.input[side] = pressed;
  }
  beginLaunch() { if (this.state === 'playing' && this.physics.balls.some(b => b.ready)) { this.charging = true; this.charge = 0; } }
  releaseLaunch() {
    if (!this.charging || this.state !== 'playing') return;
    this.charging = false; this.physics.launch(Math.max(.32, this.charge)); this.charge = 0;
  }
  nudge(direction = 0) {
    if (this.state !== 'playing' || this.tilted || this.time - this.lastNudge < .3 || !this.physics.balls.some(b => !b.ready)) return;
    this.lastNudge = this.time; this.tilt += 1.05;
    if (this.tilt >= 2.8) {
      this.tilted = true; this.input.left = this.input.right = false; this.saveUntil = 0; this.bonus = 0;
      this.garden.endBall();
      this.message('TILT', 'Za mocno. Flippery odpoczywają do następnej kuli.', 'tilt'); this.notify({ type: 'tilt' }); return;
    }
    this.physics.balls.forEach(b => { if (!b.ready && !b.captured) { b.vx += direction * 100; b.vy -= 95; } });
    this.notify({ type: 'nudge' }); if (this.tilt > 1.7) this.message('DELIKATNIE…', 'Kolejne szybkie potrząśnięcie oznacza tilt', 'warning');
  }
  addScore(value, x = 291, y = 400, label = '') {
    if (this.tilted) return;
    const total = Math.round(value * this.multiplier * (this.koiUntil > this.time ? 2 : 1));
    this.score += total; this.highScore = Math.max(this.highScore, this.score); this.bonus += Math.round(value * .08);
    this.notify({ type: 'points', value: total, x, y, label });
    if (this.score >= 150000 && !this.extraEarned) { this.extraEarned = true; this.extraBalls++; this.message('DODATKOWA KULA', '150 000 punktów · ogród zaprasza na dłużej', 'extra'); this.notify({ type: 'extra' }); }
  }
  shot(id, x, y) {
    if (this.tilted) return;
    if (id === this.lastShot && this.time < this.comboUntil) return;
    if (id !== this.lastShot && this.time < this.comboUntil) this.combo++; else if (this.time >= this.comboUntil) this.combo = 1;
    this.lastShot = id; this.comboUntil = this.time + 5;
    if (this.combo >= 2) {
      this.addScore(500 * Math.min(this.combo, 8), x, y, `COMBO ×${this.combo}`);
      this.notify({ type: 'combo', count: this.combo, x, y });
      if (this.combo === 3 || this.combo === 6) { this.multiplier = Math.min(8, this.multiplier + 1); this.message('ZEN FLOW', `Combo ×${this.combo} · mnożnik punktów ×${this.multiplier}`, 'combo'); }
    }
  }
  startMultiball() {
    if (this.multiball) return;
    if (this.garden.finaleActive) { this.garden.deferredMultiball = true; return; }
    this.multiball = true; this.jackpots = 0; this.saveUntil = this.time + 13;
    this.pending.push({ at: this.time + .6, action: 'multi' }, { at: this.time + 1.3, action: 'multi' });
    this.message('MOONLIGHT MULTIBALL', 'Trzy kule · traf w torii po jackpot', 'multiball'); this.notify({ type: 'multiball' });
  }
  handle(e) {
    this.notify(e);
    const b = e.ball;
    if (e.type === 'launch') {
      this.stats.launches++;
      if (!this.tilted) this.saveUntil = Math.max(this.saveUntil, this.time + 12);
      return;
    }
    if (e.type === 'drain') { this.drain(); return; }
    if (e.type === 'search') { this.stats.searches++; return; }
    if (this.tilted) return;
    if (this.garden.shot(e)) return;
    if (/^bumper\d/.test(e.type)) {
      this.stats.bumpers++; this.hits++; this.addScore(250, b.x, b.y);
      if (this.hits % 12 === 0) { this.multiplier = Math.min(8, this.multiplier + 1); this.message('LOTOS ROZKWITA', `Mnożnik punktów ×${this.multiplier}`, 'multiplier'); }
    } else if (/^target\d/.test(e.type)) {
      const i = Number(e.type.slice(6)); const bank = i < 3 ? this.koi : this.sakura; const n = i % 3;
      this.stats.targets++; this.addScore(bank[n] ? 150 : 1000, b.x, b.y); this.shot(e.type, b.x, b.y); bank[n] = true;
      if (bank.every(Boolean)) {
        bank.fill(false); this.addScore(3500, b.x, b.y);
        if (i < 3) { this.koiUntil = this.time + 22; this.message('KOI RUN', 'Podwójne punkty przez 22 sekundy', 'koi'); this.notify({ type: 'koi' }); this.garden.seal('koi'); }
        else { const capped = this.multiplier === 8; this.multiplier = Math.min(8, this.multiplier + 1); this.message('SAKURA BLOOM', `Mnożnik punktów ×${this.multiplier}`, 'sakura'); this.garden.sakuraReward(capped); }
      }
    } else if (e.type === 'lane') {
      this.moon[e.index] = true; this.addScore(600, b.x, b.y); this.shot('lane', b.x, b.y);
      if (b.skill) { b.skill = false; if (e.index === 1) { this.addScore(5000, b.x, b.y, 'SKILL SHOT'); this.saveUntil += 4; this.message('SKILL SHOT', 'Środkowy przejazd · +5 000 · ball save +4 s', 'skill'); this.notify({ type: 'skill' }); } }
      if (this.moon.every(Boolean)) { this.moon.fill(false); this.lockCount++; if (!this.multiball) this.startMultiball(); else this.addScore(10000, b.x, b.y); }
    } else if (e.type === 'orbit') {
      this.stats.orbits++; this.addScore(2500, b.x, b.y, 'ORBIT'); this.shot(e.side, b.x, b.y);
      const unlit = this.moon.indexOf(false); if (unlit >= 0) this.moon[unlit] = true;
      if (this.moon.every(Boolean) && !this.multiball) { this.moon.fill(false); this.startMultiball(); }
    } else if (e.type === 'scoop') {
      this.shot('torii', 291, 150);
      if (this.multiball) {
        this.jackpots++; this.stats.jackpots++; const superJackpot = this.jackpots % 3 === 0;
        this.addScore(superJackpot ? 50000 : 15000, 291, 140, superJackpot ? 'SUPER JACKPOT' : 'JACKPOT');
        this.message(superJackpot ? 'SUPER JACKPOT' : 'TORII JACKPOT', superJackpot ? 'Księżyc rozświetla cały ogród' : `${this.jackpots % 3} / 3 do super jackpota`, 'jackpot');
        this.notify({ type: 'jackpot', super: superJackpot });
        this.garden.seal('moon');
      } else {
        this.addScore(3000, 291, 140, 'TORII');
        const unlit = this.moon.indexOf(false); if (unlit >= 0) this.moon[unlit] = true;
        if (this.moon.every(Boolean)) { this.moon.fill(false); this.startMultiball(); } else this.message('ŚWIATŁO KSIĘŻYCA', `${this.moon.filter(Boolean).length} / 3 · rozświetl kolejne przejazdy`, 'moon');
      }
    } else if (e.type === 'spinner') { this.addScore(400, b.x, b.y); this.shot('spinner', b.x, b.y); }
    else if (e.type === 'inlane') { this.addScore(500, b.x, b.y); this.comboUntil = Math.max(this.comboUntil, this.time + 4); }
    else if (e.type.startsWith('sling')) this.addScore(100, b.x, b.y);
  }
  drain() {
    if (this.time < this.saveUntil && !this.tilted) {
      this.stats.saves++; this.pending.push({ at: this.time + .7, action: 'save' });
      this.message('BALL SAVE', 'Ogród daje Ci jeszcze jedną szansę', 'save'); return;
    }
    if (this.physics.balls.length + this.pending.length > 0) {
      if (this.physics.balls.length + this.pending.length === 1 && this.multiball) { this.multiball = false; this.message('SPOKÓJ POWRACA', 'Moonlight Multiball zakończony', 'calm'); }
      return;
    }
    this.multiball = false;
    this.garden.endBall();
    const bonus = this.tilted ? 0 : Math.floor(this.bonus * this.multiplier);
    this.score += bonus; this.highScore = Math.max(this.highScore, this.score);
    this.message('BONUS OGRODU', `+${bonus.toLocaleString('pl-PL')} · mnożnik ×${this.multiplier}`, 'bonus');
    this.notify({ type: 'bonus', value: bonus }); this.nextBallAt = this.time + 2.6;
  }
  nextBall() {
    if (this.extraBalls) this.extraBalls--; else this.ballNumber++;
    this.nextBallAt = 0;
    if (this.ballNumber > 3) { this.ballNumber = 3; this.state = 'gameover'; this.notify({ type: 'gameover' }); return; }
    this.tilt = 0; this.tilted = false; this.multiplier = 1; this.combo = 0; this.bonus = 0; this.koiUntil = 0;
    this.physics.addBall(); this.message(`KULA ${this.ballNumber} / 3`, 'Przytrzymaj SPACJĘ · celuj w środkowy przejazd', 'start');
  }
  update(dt) {
    if (this.state !== 'playing') return;
    this.accumulator += Math.min(dt, .1);
    while (this.accumulator >= STEP) {
      this.time += STEP; this.tilt = Math.max(0, this.tilt - STEP * .16);
      this.garden.tick();
      if (this.charging) this.charge = clamp(this.charge + STEP * .8, 0, 1);
      if (this.comboUntil < this.time) this.combo = 0;
      for (const p of [...this.pending]) if (p.at <= this.time) {
        this.pending.splice(this.pending.indexOf(p), 1);
        // A visible upper kickout releases replacement and locked balls continuously.
        const b = this.physics.addBall(291, 112); b.ready = false; b.shooter = false; b.captured = .3;
      }
      this.physics.powered = !this.tilted;
      this.physics.step(STEP, this.tilted ? {} : this.input);
      if (this.nextBallAt && this.time >= this.nextBallAt) this.nextBall();
      this.accumulator -= STEP;
      if (this.state !== 'playing') { this.accumulator = 0; break; }
    }
  }
}

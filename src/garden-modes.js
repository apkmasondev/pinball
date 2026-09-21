// Rule state uses the simulation clock: pause, slow frames and ball save cannot
// spend mode time. Seals belong to the game; timed awards belong to the ball.
export const LOTUS_CHARGE = 4;
export const LOTUS_SECONDS = 25;
export const FINALE_SECONDS = 45;
const STEPS = ['koi', 'sakura', 'spinner', 'lotus', 'torii'];
const LABELS = ['Dowolny lewy cel', 'Dowolny prawy cel', 'Spinner', 'Złoty lotos', 'Torii'];
export class GardenModes {
  constructor(game) {
    this.game = game; this.seals = { koi: false, sakura: false, moon: false };
    this.charge = 0; this.lotusUntil = 0; this.pot = 0; this.sakuraBonus = 0;
    this.finaleUntil = 0; this.step = 0; this.completed = false; this.deferredMultiball = false;
    this.collected = 0; this.wins = 0;
  }
  get lotusActive() { return this.lotusUntil > this.game.time; }
  get finaleActive() { return this.finaleUntil > this.game.time; }
  get qualified() { return !this.completed && Object.values(this.seals).every(Boolean); }
  get canStart() { return this.qualified && !this.finaleActive && !this.lotusActive && !this.game.multiball && !this.game.pending.length; }
  seal(name) {
    if (this.seals[name]) return;
    this.seals[name] = true;
    this.game.notify({ type: 'gardenSeal', name });
    if (this.qualified) this.game.message('TRZY PIECZĘCIE OGRODU', 'Noc pełni gotowa · po multiballu traf w torii', 'garden');
  }
  sakuraReward(capped) {
    this.seal('sakura');
    if (!capped) return;
    if (this.lotusActive) this.pot = Math.min(25000, this.pot + 5000);
    else this.sakuraBonus = Math.min(15000, this.sakuraBonus + 5000);
    // At the bank cap there is still a concrete award to earn.
    this.game.addScore(2500, 452, 510, 'SAKURA ×8');
    this.game.message('SAKURA W PEŁNYM ROZKWICIE', `+2 500 × mnożniki · premia lotosu ${this.lotusActive ? this.pot : this.sakuraBonus}`, 'garden');
  }
  activateLotus() {
    this.charge = LOTUS_CHARGE; this.lotusUntil = this.game.time + LOTUS_SECONDS;
    this.pot = 5000 + this.sakuraBonus; this.sakuraBonus = 0;
    this.game.message('GOLDEN LOTUS', 'Lotos buduje premię · torii ją odbiera · 25 s', 'garden');
    this.game.notify({ type: 'lotusReady' });
  }
  // Returns true only when the scoop is owned by the finale, so a qualifying
  // capture cannot also start multiball or skip the finale's first step.
  shot(e) {
    const g = this.game;
    if (g.tilted) return false;
    if (this.finaleActive) {
      const hit = e.type.startsWith('target') ? (+e.type.slice(6) < 3 ? 'koi' : 'sakura')
        : e.type === 'bumper2' ? 'lotus' : e.type === 'scoop' ? 'torii' : e.type;
      if (hit === STEPS[this.step]) {
        this.step++;
        if (this.step === STEPS.length) {
          this.completed = true; this.wins++; this.finaleUntil = 0;
          g.addScore(50000, 291, 140, 'NOC PEŁNI');
          g.message('OGRÓD W PEŁNYM BLASKU', 'Noc pełni ukończona · 50 000 × mnożniki', 'finale');
          g.notify({ type: 'finaleWon' }); this.releaseMultiball();
        } else {
          g.message('NOC PEŁNI', `${this.step} / 5 · następny cel: ${LABELS[this.step]}`, 'finale');
          g.notify({ type: 'finaleStep', step: this.step });
        }
      }
      return e.type === 'scoop';
    }
    if (e.type === 'scoop' && this.lotusActive) {
      const value = this.pot; this.lotusUntil = 0; this.charge = 0; this.pot = 0; this.collected++;
      g.addScore(value, 291, 140, 'GOLDEN LOTUS');
      g.message('ZŁOTY LOTOS ODEBRANY', `${value.toLocaleString('pl-PL')} × mnożniki`, 'garden');
      g.notify({ type: 'lotusCollect' }); return false;
    }
    if (e.type === 'scoop' && this.canStart) {
      this.finaleUntil = g.time + FINALE_SECONDS; this.step = 0;
      g.message('NOC PEŁNI', '5 celów w kolejności · 45 s · zacznij od lewego celu', 'finale');
      g.notify({ type: 'finaleStart' }); return true;
    }
    if (e.type === 'spinner' && !this.lotusActive && !this.qualified) {
      this.charge++;
      if (this.charge >= LOTUS_CHARGE) this.activateLotus();
      else g.notify({ type: 'lotusCharge', charge: this.charge });
    }
    if (e.type === 'bumper2' && this.lotusActive) {
      this.pot = Math.min(25000, this.pot + 1500);
      g.notify({ type: 'lotusBuild' });
    }
    return false;
  }
  releaseMultiball() {
    if (!this.deferredMultiball) return;
    this.deferredMultiball = false;
    if (!this.game.tilted) this.game.startMultiball();
  }
  tick() {
    if (this.lotusUntil && !this.lotusActive) {
      this.lotusUntil = 0; this.charge = 0; this.pot = 0;
      this.game.message('LOTOS ZASYPIA', 'Premia wygasła · spinner ponownie ładuje lotos', 'notice');
    }
    if (this.finaleUntil && !this.finaleActive) {
      this.finaleUntil = 0; this.step = 0;
      this.game.message('NOC JESZCZE SIĘ NIE KOŃCZY', 'Pieczęcie zostają · ponów finał w torii', 'garden');
      this.releaseMultiball();
    }
  }
  endBall() {
    this.lotusUntil = 0; this.charge = 0; this.pot = 0; this.sakuraBonus = 0;
    this.finaleUntil = 0; this.step = 0; this.deferredMultiball = false;
  }
  objective() {
    const g = this.game, seconds = end => Math.max(0, Math.ceil(end - g.time));
    if (g.tilted) return { key: 'tilt', title: 'TILT', detail: 'Poczekaj na następną kulę', shots: [] };
    if (g.state === 'attract' || g.state === 'gameover') return { key: 'intro', title: 'TRZY PIECZĘCIE · JEDNA NOC', detail: 'Koi · Sakura · Jackpot → finał w torii', shots: [] };
    if (g.nextBallAt) return { key: 'bonus', title: 'BONUS OGRODU', detail: 'Pieczęcie przechodzą na kolejną kulę', shots: [] };
    if (g.physics.balls.some(b => b.ready)) return { key: 'launch', title: 'CELUJ W ŚRODKOWY PRZEJAZD', detail: 'Skill shot · +5 000 i dłuższa ochrona', shots: ['lane'] };
    if (this.finaleActive) return { key: 'finale', title: `NOC PEŁNI · ${seconds(this.finaleUntil)} s`, detail: `${this.step + 1}/5 · ${LABELS[this.step]}`, shots: [STEPS[this.step]] };
    if (this.lotusActive) return { key: 'lotus', title: `GOLDEN LOTUS · ${seconds(this.lotusUntil)} s`, detail: `${this.pot.toLocaleString('pl-PL')} × mnożniki · odbierz w torii`, shots: ['lotus', 'torii'] };
    if (this.canStart) return { key: 'ready', title: 'NOC PEŁNI GOTOWA', detail: 'Traf w torii, aby rozpocząć finał', shots: ['torii'] };
    if (g.multiball) return { key: 'multi', title: 'TORII → JACKPOT', detail: `${g.jackpots % 3}/3 do super jackpota`, shots: ['torii'] };
    const left = g.koi.filter(Boolean).length, right = g.sakura.filter(Boolean).length;
    if (left >= 2 || right >= 2) {
      const koi = left >= right;
      return { key: koi ? 'koi' : 'sakura', title: koi ? 'OSTATNI LEWY CEL → KOI RUN' : 'OSTATNI PRAWY CEL → SAKURA', detail: koi ? '22 sekundy podwójnych punktów' : g.multiplier === 8 ? 'Dodatkowe punkty i premia lotosu' : 'Podnieś mnożnik punktów', shots: [koi ? 'koi' : 'sakura'] };
    }
    if (g.moon.filter(Boolean).length >= 2) return { key: 'moon', title: 'TORII → MULTIBALL', detail: 'Brakuje jednego światła księżyca', shots: ['torii'] };
    return { key: 'charge', title: `SPINNER → GOLDEN LOTUS · ${this.charge}/${LOTUS_CHARGE}`, detail: this.completed ? 'Finał zdobyty · graj dalej po rekord' : 'Naładuj lotos, zbuduj i odbierz premię', shots: ['spinner'] };
  }
}

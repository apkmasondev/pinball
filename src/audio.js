export class GardenAudio {
  constructor() {
    this.settings = { master: .65, music: .55, sfx: .65 }; this.ctx = null; this.muted = false;
    this.nextNote = 0; this.note = 0; this.last = {}; this.trackState = 'idle'; this.musicSource = null;
  }
  async init() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: 44100 }); const c = this.ctx;
    this.master = c.createGain(); this.music = c.createGain(); this.sfx = c.createGain();
    const compressor = c.createDynamicsCompressor(); compressor.threshold.value = -12; compressor.ratio.value = 6;
    compressor.knee.value = 12; compressor.attack.value = .006; compressor.release.value = .2;
    this.music.connect(this.master); this.sfx.connect(this.master); this.master.connect(compressor); compressor.connect(c.destination);
    this.fallback = c.createGain(); this.fallback.connect(this.music);
    this.musicDuck = c.createGain(); this.musicDuck.connect(this.music);
    this.reverb = c.createConvolver(); const impulse = c.createBuffer(2, c.sampleRate * 2.5, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = impulse.getChannelData(ch); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, 3) * .28; }
    this.reverb.buffer = impulse; const wet = c.createGain(); wet.gain.value = .3; this.reverb.connect(wet); wet.connect(this.fallback);
    this.noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const samples = this.noiseBuffer.getChannelData(0);
    let brown = 0; for (let i = 0; i < samples.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02; samples[i] = brown * 3; }
    const noise = c.createBufferSource(); noise.buffer = this.noiseBuffer; noise.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 680;
    const gain = c.createGain(); gain.gain.value = .018; noise.connect(filter); filter.connect(gain); gain.connect(this.music); noise.start();
    this.apply(); this.nextNote = c.currentTime + .15;
    fetch('public/drain.mp3').then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(b => this.drainBuffer = b).catch(() => {});
    this.loadSoundtrack();
    await c.resume();
  }
  async loadSoundtrack() {
    if (this.trackState !== 'idle') return;
    this.trackState = 'loading';
    try {
      const response = await fetch('public/garden-soundtrack.m4a');
      if (!response.ok) throw new Error('Soundtrack unavailable');
      this.trackBuffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      const source = this.ctx.createBufferSource(), fade = this.ctx.createGain();
      source.buffer = this.trackBuffer; source.loop = true;
      // The prepared two-second crossfade makes the buffer boundary continuous.
      // AudioContext time preserves the musical position across a game pause.
      fade.gain.setValueAtTime(0, this.ctx.currentTime);
      fade.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.8);
      source.connect(fade); fade.connect(this.musicDuck); source.start();
      this.musicSource = source; this.trackStartedAt = this.ctx.currentTime;
      this.fallback.gain.setTargetAtTime(0, this.ctx.currentTime, .35);
      this.trackState = 'playing';
    } catch { this.trackState = 'fallback'; }
  }
  duckMusic(amount = .72, duration = 1.2) {
    if (!this.musicDuck) return;
    const now = this.ctx.currentTime, gain = this.musicDuck.gain;
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(amount, now + .09);
    gain.setTargetAtTime(1, now + duration, .45);
  }
  apply() { if (!this.ctx) return; for (const key of ['master', 'music', 'sfx']) this[key].gain.setTargetAtTime(key === 'master' && this.muted ? 0 : this.settings[key], this.ctx.currentTime, .08); }
  tone(freq, duration = .25, gain = .1, type = 'sine', music = false, delay = 0) {
    if (!this.ctx) return; const c = this.ctx, at = c.currentTime + delay;
    const osc = c.createOscillator(), amp = c.createGain(); osc.type = type; osc.frequency.setValueAtTime(freq, at);
    amp.gain.setValueAtTime(.0001, at); amp.gain.exponentialRampToValueAtTime(gain, at + .008); amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(amp); amp.connect(music ? this.fallback : this.sfx); if (music) amp.connect(this.reverb);
    osc.start(at); osc.stop(at + duration + .02);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  }
  // intensity: 0 calm, 1 koi run, 2 multiball. The phrase keeps its shape and gains
  // a voice and a faster pulse, so the garden never stops sounding like itself.
  tick(active, intensity = 0) {
    if (!this.ctx || this.ctx.state !== 'running' || !active) return;
    if (this.musicSource) return;
    if (this.ctx.currentTime > this.nextNote) {
      const melody = [0, 7, 12, 14, 7, 4, 9, 7, 0, 4, 12, 7, 9, 4, 2, 7];
      const note = melody[this.note % melody.length]; const hz = 146.83 * 2 ** (note / 12);
      this.tone(hz, 2.8, .14, 'sine', true); this.tone(hz * 2.002, 1.4, .03, 'sine', true);
      if (intensity) this.tone(hz * (intensity > 1 ? 3 : 1.5), 1.6, .045, 'triangle', true, .04);
      if (this.note % 4 === 0) this.tone(73.42 * (this.note % 8 ? 1.5 : 1), 4, .065, 'sine', true);
      if (intensity > 1 && this.note % 2 === 0) this.tone(97.999, 3.2, .06, 'sine', true, .05);
      this.note++;
      const pace = intensity > 1 ? .68 : intensity ? .78 : 1;
      this.nextNote = this.ctx.currentTime + (this.note % 4 === 0 ? 1.9 : .83) * pace;
    }
  }
  noise(duration = .06, gain = .2, freq = 1500) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain();
    s.buffer = this.noiseBuffer; f.type = 'highpass'; f.frequency.value = freq;
    a.gain.setValueAtTime(gain, c.currentTime); a.gain.exponentialRampToValueAtTime(.0001, c.currentTime + duration);
    s.connect(f); f.connect(a); a.connect(this.sfx); s.start(); s.stop(c.currentTime + duration);
    s.onended = () => { s.disconnect(); f.disconnect(); a.disconnect(); };
  }
  event(e) {
    if (!this.ctx) return; const t = this.ctx.currentTime, type = e.type;
    if (t - (this.last[type] ?? -10) < .045) return; this.last[type] = t;
    if (['lotusReady', 'lotusCollect', 'finaleStart', 'finaleStep', 'finaleWon', 'gardenSeal', 'lotusCharge', 'lotusBuild'].includes(type)) {
      const notes = type === 'finaleWon' ? [0, 7, 12, 19, 24, 31] : type === 'finaleStart' ? [0, 7, 12, 19] : type === 'lotusCollect' ? [7, 12, 19, 24] : type === 'lotusReady' ? [0, 7, 12] : [7 + (e.step || e.charge || 0) * 2];
      if (this.settings.sfx > 0 && notes.length > 2) this.duckMusic(.75, 1.1);
      notes.forEach((n, i) => this.tone(293.66 * 2 ** (n / 12), .9, .065, 'sine', false, i * .11));
      return;
    }
    if (this.settings.sfx > 0 && ['jackpot', 'multiball', 'extra'].includes(type)) this.duckMusic(type === 'jackpot' ? .66 : .79, type === 'multiball' ? 1.8 : 1.1);
    if (type === 'flipperPress') { this.noise(.055, .65, 600); this.tone(105, .045, .2, 'triangle'); }
    else if (type.startsWith('bumper')) { this.tone(440 * 2 ** (Number(type.at(-1)) * 3 / 12), .38, .18, 'sine'); this.noise(.07, .3, 450); }
    else if (type.startsWith('target')) { this.tone(880 * 2 ** ((Number(type.at(-1)) % 3) * 2 / 12), .35, .13, 'triangle'); }
    else if (type.startsWith('sling')) { this.noise(.09, .6, 400); this.tone(180, .1, .12, 'triangle'); }
    else if (type === 'wall' || type === 'flipper') this.noise(.045, Math.min(.5, (e.speed || 200) / 2200), 800);
    else if (type === 'spinner') { [0, .065, .13].forEach(d => this.tone(1200, .04, .05, 'sine', false, d)); }
    else if (type === 'launch') { this.noise(.3, .5, 300); this.tone(180, .22, .12, 'triangle'); }
    else if (type === 'drain') {
      if (this.drainBuffer) { const source = this.ctx.createBufferSource(); source.buffer = this.drainBuffer; const gain = this.ctx.createGain(); gain.gain.value = .3; source.connect(gain); gain.connect(this.sfx); source.start(); source.onended = () => { source.disconnect(); gain.disconnect(); }; }
      this.tone(146.83, .7, .13, 'sine');
    } else if (type === 'jackpot') {
      // The jackpot has its own shape: a rising pentatonic run, doubled an octave up
      // for the super award, so the two never sound alike.
      const run = e.super ? [0, 7, 12, 19, 24, 28, 31] : [0, 7, 12, 16, 19];
      run.forEach((n, i) => {
        this.tone(293.66 * 2 ** (n / 12), .85, e.super ? .1 : .085, 'sine', false, i * .07);
        if (e.super) this.tone(587.33 * 2 ** (n / 12), .5, .035, 'triangle', false, i * .07 + .02);
      });
      this.noise(.25, .28, 2600);
    } else if (type === 'multiball') {
      [0, 12, 19].forEach((n, i) => this.tone(146.83 * 2 ** (n / 12), 2.6, .12, 'sine', false, i * .16));
      [0, 5, 7, 12].forEach((n, i) => this.tone(587.33 * 2 ** (n / 12), 1.1, .05, 'triangle', false, .5 + i * .12));
    } else if (type === 'extra') {
      [0, 4, 7, 12].forEach((n, i) => this.tone(440 * 2 ** (n / 12), 1.2, .075, 'sine', false, i * .11));
    } else if (type === 'bonus') {
      [19, 12, 7, 0].forEach((n, i) => this.tone(293.66 * 2 ** (n / 12), 1.1, .07, 'sine', false, i * .13));
    } else if (type === 'koi') {
      [0, 3, 7, 10].forEach((n, i) => this.tone(392 * 2 ** (n / 12), 1.4, .055, 'sine', false, i * .1));
    } else if (type === 'skill') {
      [12, 19, 24].forEach((n, i) => this.tone(293.66 * 2 ** (n / 12), .7, .09, 'triangle', false, i * .06));
    } else if (type === 'orbit') {
      this.noise(.4, .3, 900); this.tone(220, .45, .07, 'sine'); this.tone(330, .4, .05, 'sine', false, .08);
    } else if (['combo', 'lane', 'scoop'].includes(type)) {
      const chord = type === 'combo' ? [0, 7 + Math.min(e.count, 8)] : type === 'lane' ? [12] : [0, 7, 12, 16, 19];
      chord.forEach((n, i) => this.tone(293.66 * 2 ** (n / 12), .9, .09, 'sine', false, i * .09));
    } else if (type === 'tilt') this.tone(65, .7, .2, 'triangle');
    else if (type === 'kickout') this.noise(.08, .65, 500);
  }
  async pause(value) { if (!this.ctx) return; if (value) await this.ctx.suspend(); else { await this.ctx.resume(); this.nextNote = this.ctx.currentTime + .2; } }
}

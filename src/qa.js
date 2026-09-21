// Opt-in local QA surface: never mounted in the normal game.
import { VIEW_H } from './render.js';
import { targets } from './physics.js';
export function mountQA(game, renderer, audio, update) {
  // Opt-in handle for scripted checks; only ever created behind ?qa=1.
  window.qa = { game, renderer, audio, update };
  const panel = document.createElement('div'); panel.id = 'qa-panel';
  panel.style.cssText = 'position:fixed;left:10px;bottom:40px;z-index:20;padding:10px;background:#041219ee;border:1px solid #bda678;font:10px monospace;max-width:300px;';
  panel.innerHTML = '<button id="qa-autoplay">Autoplay 60s</button> <button id="qa-stop">Stop autoplay</button> <button id="qa-multiball">Multiball scenario</button> <button id="qa-combo">Combo scenario</button> <button id="qa-jackpot">Torii shot</button> <button id="qa-drain">Drain scenario</button> <button id="qa-blur">Focus loss</button> <button id="qa-score">Large score</button><pre id="qa-status">Ready</pre>';
  panel.querySelector('pre').style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  document.body.append(panel);
  const controls = document.createElement('div');
  controls.innerHTML = '<button id="qa-pull">Hold full pull</button> <button id="qa-release">Release plunger</button> <button id="qa-sling-left">Left sling shot</button> <button id="qa-sling-right">Right sling shot</button>';
  controls.innerHTML += ' <button id="qa-target-left">Left target shot</button> <button id="qa-target-right">Right target shot</button>';
  panel.insertBefore(controls, panel.querySelector('pre'));
  const gardenControls = document.createElement('div');
  gardenControls.innerHTML = '<button id="qa-lotus-mode">Golden Lotus scenario</button> <button id="qa-lotus-hit">Lotus bumper shot</button> <button id="qa-finale-ready">Finale ready scenario</button> <button id="qa-finale-step">Finale next shot</button> <button id="qa-garden-expire">Expire garden mode</button>';
  panel.insertBefore(gardenControls, panel.querySelector('pre'));
  const gardenFixture = () => {
    autoUntil = 0; audio.init().catch(() => {}); game.start();
    document.getElementById('start-panel').hidden = true; document.getElementById('live-panel').hidden = false;
    const b = game.physics.balls[0]; b.ready = false; b.shooter = false; b.x = 291; b.y = 112; b.captured = 3600;
    return b;
  };
  document.getElementById('qa-lotus-mode').onclick = () => {
    const ball = gardenFixture(); for (let i = 0; i < 4; i++) game.handle({ type: 'spinner', ball }); update();
  };
  document.getElementById('qa-lotus-hit').onclick = () => {
    if (game.state !== 'playing') return; const b = game.physics.balls[0]; if (!b) return;
    b.ready = false; b.shooter = false; b.captured = 0; b.x = 291; b.y = 438; b.vx = 0; b.vy = -180; b.cooldowns.bumper2 = 0;
  };
  document.getElementById('qa-finale-ready').onclick = () => {
    const ball = gardenFixture();
    for (let i = 0; i < 6; i++) game.handle({ type: `target${i}`, ball });
    game.startMultiball(); game.handle({ type: 'scoop', ball });
    game.pending = []; game.multiball = false; game.saveUntil = 0; update();
  };
  document.getElementById('qa-finale-step').onclick = () => {
    if (game.state !== 'playing') return; const ball = game.physics.balls[0]; if (!ball) return;
    game.handle({ type: game.garden.finaleActive ? ['target0', 'target3', 'spinner', 'bumper2', 'scoop'][game.garden.step] : 'scoop', ball }); update();
  };
  document.getElementById('qa-garden-expire').onclick = () => {
    if (game.garden.lotusActive) game.garden.lotusUntil = game.time + .01;
    if (game.garden.finaleActive) game.garden.finaleUntil = game.time + .01;
  };
  document.getElementById('qa-blur').onclick = () => window.dispatchEvent(new Event('blur'));
  let autoUntil = 0; const frameSamples = [], workSamples = [];
  const maxSlingBend = [0, 0];
  const targetPeak = [0, 0]; let reflectionPeak = 0;
  for (const [side, i] of [['left', 0], ['right', 3]]) document.getElementById(`qa-target-${side}`).onclick = () => {
    if (game.state !== 'playing') return;
    autoUntil = 0; const b = game.physics.balls[0]; if (!b) return;
    const p = targets[i]; b.ready = false; b.shooter = false; b.captured = 0;
    b.x = p.x + p.side * 23; b.y = p.y; b.vx = -p.side * 180; b.vy = -15;
    b.cooldowns[`target${i}`] = 0; b.trail.length = 0; targetPeak[i / 3] = 0;
  };
  document.getElementById('qa-pull').onclick = () => {
    autoUntil = 0; audio.init().catch(() => {}); game.start(); game.beginLaunch();
    document.getElementById('start-panel').hidden = true; document.getElementById('live-panel').hidden = false;
  };
  document.getElementById('qa-release').onclick = () => game.releaseLaunch();
  for (const [i, side] of [[0, 'left'], [1, 'right']]) document.getElementById(`qa-sling-${side}`).onclick = () => {
    if (game.state !== 'playing') return;
    autoUntil = 0; const b = game.physics.balls[0]; if (!b) return;
    const nx = (i ? -1 : 1) * 125 / Math.hypot(91, 125), ny = -91 / Math.hypot(91, 125);
    b.ready = false; b.shooter = false; b.captured = 0;
    b.x = (i ? 412.5 : 187.5) + nx * 16; b.y = 727.5 + ny * 16;
    b.vx = -nx * 180; b.vy = -ny * 180; b.cooldowns[`sling${i}`] = 0; b.trail.length = 0;
    maxSlingBend[i] = 0;
  };
  document.getElementById('qa-stop').onclick = () => { autoUntil = 0; game.setFlipper('left', false); game.setFlipper('right', false); };
  document.getElementById('qa-combo').onclick = () => { if (game.state !== 'playing') return; ['target0', 'spinner', 'target3'].forEach(type => game.handle({ type, ball: { x: 291, y: 600 } })); };
  document.getElementById('qa-jackpot').onclick = () => {
    if (game.state !== 'playing') return;
    const b = game.physics.balls[0]; if (!b) return;
    b.ready = false; b.shooter = false; b.captured = 0; b.x = 291; b.y = 125; b.vx = 0; b.vy = -130; b.cooldowns.scoop = 0;
  };
  document.getElementById('qa-score').onclick = () => { game.score = 123456789; update(); };
  document.getElementById('qa-autoplay').onclick = () => { audio.init().catch(() => {}); game.start(); autoUntil = game.time + 60; document.getElementById('start-panel').hidden = true; document.getElementById('live-panel').hidden = false; };
  document.getElementById('qa-multiball').onclick = async () => {
    audio.init().catch(() => {}); game.start(); game.physics.balls = []; const b = game.physics.addBall(291, 145); b.ready = false;
    game.startMultiball(); game.koiUntil = game.time + 22; game.multiplier = 3;
    document.getElementById('start-panel').hidden = true; document.getElementById('live-panel').hidden = false;
    autoUntil = game.time + 30;
  };
  document.getElementById('qa-drain').onclick = () => { if (game.state !== 'playing') game.start(); game.saveUntil = 0; game.pending = []; game.physics.balls.forEach(b => { b.ready = false; b.shooter = false; b.captured = 0; b.x = 290; b.y = 1003; b.vy = 100; }); };
  setInterval(() => {
    if (game.state === 'playing' && game.time < autoUntil) {
      if (game.physics.balls.some(b => b.ready)) game.physics.launch(.68);
      for (const [side, i] of [['left', 0], ['right', 1]]) {
        const f = game.physics.flippers[i];
        const danger = game.physics.balls.some(b => !b.ready && b.y > 837 && b.y < 892 && b.x > (i ? 307 : 214) && b.x < (i ? 386 : 293) && b.vy > 0);
        game.setFlipper(side, danger);
      }
    }
    const balls = game.physics.balls.map(b => `${b.id}: ${b.x.toFixed(0)},${b.y.toFixed(0)} v=${Math.hypot(b.vx,b.vy).toFixed(0)}`).join('\n');
    if (renderer.metrics && game.state === 'playing') { frameSamples.push(renderer.metrics.frameMs); workSamples.push(renderer.metrics.workMs); if (frameSamples.length > 600) { frameSamples.shift(); workSamples.shift(); } }
    const average = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const elapsed = audio.musicSource ? audio.ctx.currentTime - audio.trackStartedAt : 0;
    document.getElementById('qa-status').textContent = `${game.state} t=${game.time.toFixed(1)} score=${game.score}\nball=${game.ballNumber} multi=${game.multiball} combo=${game.combo}\n${balls}\n${JSON.stringify(game.stats)}\naudio=${audio.ctx?.state || 'off'} track=${audio.trackState} music=${elapsed.toFixed(1)}/${audio.trackBuffer?.duration.toFixed(1) || 0}s loop=${audio.musicSource?.loop || false}\nsettings=${JSON.stringify(audio.settings)}\nfullscreen=${!!document.fullscreenElement} ${innerWidth}x${innerHeight}\nframe=${average(frameSamples).toFixed(2)}ms work=${average(workSamples).toFixed(2)}ms`;
    for (const i of [0, 1]) maxSlingBend[i] = Math.max(maxSlingBend[i], Math.abs(renderer.slingDeflection(i)));
    const knob = renderer.assets['shooter-knob'];
    const bottom = 938 + game.charge * 22 + Math.sin(renderer.t * 46) * (renderer.recoil ?? 0) + 76 + 31 * knob.height / knob.width / 2;
    const comboPops = renderer.points.filter(p => p.label?.startsWith('COMBO ×')).length;
    document.getElementById('qa-status').textContent += `\ncharge=${game.charge.toFixed(2)} knobBottom=${bottom.toFixed(1)}/${VIEW_H}\ncomboBanner=${renderer.banner?.title || 'none'} comboPops=${comboPops}\nslingPeak=${maxSlingBend.map(v => v.toFixed(2)).join(',')} reducedMotion=${renderer.reducedMotion}`;
    for (const i of [0, 1]) targetPeak[i] = Math.max(targetPeak[i], Math.abs(renderer.targetMotion(i * 3)));
    reflectionPeak = Math.max(reflectionPeak, renderer.reflections.length);
    document.getElementById('qa-status').textContent += `\ntargetPeak=${targetPeak.map(v => v.toFixed(2))} reflectionPeak=${reflectionPeak}`;
    document.getElementById('qa-status').textContent += `\ngarden=${JSON.stringify({ charge: game.garden.charge, lotus: game.garden.lotusActive, pot: game.garden.pot, collected: game.garden.collected, seals: game.garden.seals, finale: game.garden.finaleActive, step: game.garden.step, completed: game.garden.completed, deferred: game.garden.deferredMultiball })}`;
  }, 45);
}

import { Game } from './game.js';
import { GardenAudio } from './audio.js';
import { Renderer, ASSETS } from './render.js';
const $ = id => document.getElementById(id);
const audio = new GardenAudio();
let renderer, messageUntil = 0, saved = 0, pausedByDialog = false, dialogKind = '', lastUi = -1;
const storagePrefix = new URLSearchParams(location.search).has('qa') ? 'qa-' : '';
const storage = { read(key, fallback) { try { const value = localStorage.getItem(storagePrefix + key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } }, write(key, value) { try { localStorage.setItem(storagePrefix + key, JSON.stringify(value)); } catch { /* Private-mode games remain fully playable. */ } } };
const storedHigh = storage.read('night-garden-best', 0);
const game = new Game(e => {
  renderer?.event(e); audio.event(e);
  if (e.type === 'message') {
    // The table already carries one live combo readout; the HUD shows its multiplier.
    if (e.kind === 'combo') return;
    const box = $('message');
    // Give a major award time to read before another ordinary target message.
    if (performance.now() < messageUntil && ['multiball', 'jackpot', 'extra'].includes(box.dataset.kind)
      && ['combo', 'moon', 'koi', 'sakura', 'multiplier', 'skill'].includes(e.kind)) return;
    box.querySelector('strong').textContent = e.title; box.querySelector('span').textContent = e.subtitle;
    box.dataset.kind = e.kind;
    box.classList.add('visible'); messageUntil = performance.now() + (['multiball', 'jackpot'].includes(e.kind) ? 3500 : 2700);
  }
  if (e.type === 'gameover') { persist(); showDialog('gameover'); }
});
game.highScore = Number.isFinite(storedHigh) && storedHigh >= 0 ? storedHigh : 0; saved = game.highScore;
const preferences = storage.read('night-garden-audio', {});
for (const key of ['master', 'music', 'sfx']) if (Number.isFinite(preferences?.[key])) audio.settings[key] = Math.max(0, Math.min(1, preferences[key]));
const reduced = storage.read('night-garden-motion', matchMedia('(prefers-reduced-motion: reduce)').matches);
document.body.classList.toggle('reduced-motion', !!reduced);
function persist() { if (game.highScore > saved) { storage.write('night-garden-best', game.highScore); saved = game.highScore; } }
const format = n => Math.floor(n).toLocaleString('pl-PL').replace(/\u00a0/g, ' ');
async function begin() {
  closeDialog(false); audio.init().catch(() => {}); game.start(); $('start-panel').hidden = true; $('live-panel').hidden = false;
  $('table').focus({ preventScroll: true }); lastUi = -1; updateUI();
}
function updateUI() {
  $('score').textContent = game.score ? format(game.score) : '000 000'; $('best').textContent = format(game.highScore);
  $('score').style.setProperty('--score-chars', $('score').textContent.length);
  $('ball-number').textContent = String(game.ballNumber).padStart(2, '0'); $('multiplier').textContent = `×${game.multiplier}`;
  // Three cabinet lamps mirror the ball in play, the way the apron does on the table.
  $('ball-lamps').querySelectorAll('i').forEach((el, i) => el.classList.toggle('lit', i < 4 - game.ballNumber));
  const save = Math.max(0, game.saveUntil - game.time);
  $('save-indicator').classList.toggle('on', save > 0); $('save-time').textContent = `${Math.ceil(save)}s`;
  $('combo').textContent = game.combo >= 2 ? `×${game.combo}` : '—'; $('combo-meter').style.width = `${game.combo ? Math.max(0, (game.comboUntil - game.time) / 5) * 100 : 0}%`;
  $('moon-progress').querySelectorAll('i').forEach((el, i) => el.classList.toggle('lit', game.moon[i]));
  $('sakura-progress').querySelectorAll('i').forEach((el, i) => el.classList.toggle('lit', game.sakura[i]));
  $('koi-progress').querySelectorAll('i').forEach((el, i) => el.classList.toggle('lit', game.koi[i]));
  const ready = game.state === 'playing' && game.physics.balls.some(b => b.ready);
  $('launch-hint').hidden = !ready; $('charge-meter').style.width = `${game.charge * 100}%`;
  $('active-mode').textContent = game.tilted ? 'TILT · OCZEKIWANIE NA KULĘ' : game.multiball ? `MOONLIGHT MULTIBALL · ${game.physics.balls.length} KULE` : game.koiUntil > game.time ? `KOI RUN · ${Math.ceil(game.koiUntil - game.time)}s · PUNKTY ×2` : game.state === 'attract' ? 'SPOKÓJ PRZED PIERWSZĄ KULĄ' : game.extraBalls ? 'DODATKOWA KULA ZDOBYTA' : 'PODĄŻAJ ZA ŚWIATŁEM';
  $('pause-button').textContent = game.state === 'paused' ? '▷' : 'Ⅱ';
  $('table').setAttribute('aria-label', `Stół pinball. Wynik ${game.score}. Kula ${game.ballNumber} z 3. ${game.multiball ? 'Multiball.' : ''}`);
}
function closeDialog(resume = true) {
  if ($('menu-dialog').open) $('menu-dialog').close();
  if (resume && pausedByDialog && game.state === 'paused') { game.pause(); audio.pause(false); }
  pausedByDialog = false; dialogKind = ''; lastUi = -1;
  if (game.state === 'gameover') { $('start-panel').hidden = false; $('live-panel').hidden = true; $('start-button').querySelector('span').textContent = 'Zagraj ponownie'; }
}
function showDialog(kind) {
  held.clear();
  const dialog = $('menu-dialog');
  if (!dialog.open) { pausedByDialog = game.state === 'playing'; if (pausedByDialog) { game.pause(); audio.pause(true); } }
  dialogKind = kind;
  dialog.classList.toggle('wide', kind === 'help');
  const content = $('dialog-content');
  // Each card carries its own emblem from the delivered art, the way a real machine
  // uses a different plastic for every part of the cabinet.
  // The guide carries its own plastics strip instead, so it takes no crest here.
  const crest = { pause: 'medallion', restart: 'pagoda', gameover: 'lotus-big', sound: 'fan' }[kind];
  const emblem = crest ? `<img class="dialog-crest" src="public/${crest}.png" alt="" aria-hidden="true">` : '';
  if (kind === 'pause') content.innerHTML = emblem + `<p class="eyebrow">CHWILA DLA SIEBIE</p><h2>Ogród poczeka.</h2><p>Twój wynik i kula są bezpieczne.<br>Wróć, gdy zechcesz złapać rytm.</p><button class="garden-button" data-action="resume"><span>Wróć do ogrodu</span><b>↗</b></button><button class="secondary-button" data-action="restart">ROZPOCZNIJ OD NOWA</button>`;
  if (kind === 'restart') content.innerHTML = emblem + `<p class="eyebrow">NOWA NOC W OGRODZIE</p><h2>Jeszcze raz?</h2><p>Obecna rozgrywka zakończy się. Rekord zostanie zachowany.</p><button class="garden-button" data-action="new"><span>Nowa gra</span><b>↗</b></button><button class="secondary-button" data-action="resume">WRÓĆ DO OBECNEJ GRY</button>`;
  if (kind === 'gameover') content.innerHTML = emblem + `<p class="eyebrow">DZIĘKUJEMY ZA TĘ NOC</p><h2>${game.score >= game.highScore && game.score > 0 ? 'Nowy blask ogrodu.' : 'Piękna podróż.'}</h2><div class="final-score">${format(game.score)}</div><p>Rekord ogrodu: <strong>${format(game.highScore)}</strong><br>${game.stats.bumpers} trafień lotosu · ${game.stats.targets} trafień celów · ${game.stats.jackpots} jackpotów</p><button class="garden-button" data-action="new"><span>Jeszcze jedna gra</span><b>↗</b></button>`;
  if (kind === 'help') content.innerHTML = `<div class="plastics-strip" aria-hidden="true"><img src="public/plaq-branch.png" alt=""><img src="public/plaq-bamboo.png" alt=""><img src="public/plaq-lantern.png" alt=""><img src="public/plaq-fan.png" alt=""></div><p class="eyebrow">ZNAJDŹ SWÓJ RYTM</p><h2>Mały przewodnik.</h2><p class="lead">Trzy kule. Celuj, reaguj i podążaj za światłem.</p><div class="rule-grid"><section><h3>Flippery<span>A / D · ← / → · Shift</span></h3><p>Przytrzymaj, aby podnieść. Puść i naciśnij ponownie, żeby uderzyć. Flippery obracają też światła górnych przejazdów.</p></section><section><h3>Wyrzutnia<span>przytrzymaj i puść Spację</span></h3><p>Siła rośnie na pasku. Środkowy przejazd to skill shot: 5 000 punktów i dłuższa ochrona kuli.</p></section><section><h3>Moonlight Multiball</h3><p>Zapal trzy światła przejazdów — orbita albo torii dodaje brakujące. Potem torii: jackpot 15 000, co trzeci super jackpot 50 000.</p></section><section><h3>Koi run · Sakura bloom</h3><p>Trzy lewe cele: podwójne punkty przez 22 s. Trzy prawe: mnożnik +1. Co 12 bumperów też +1, maksymalnie ×8.</p></section><section><h3>Zen flow</h3><p>Łącz różne cele, spinner, przejazdy i orbity w ciągu 5 s. Combo 3 i 6 podnoszą mnożnik.</p></section><section><h3>Ochrona i nagrody</h3><p>Ball save trwa 12 s. Przy 150 000 dostajesz dodatkową kulę. Koniec kuli nalicza bonus × mnożnik.</p></section><section><h3>Nudge<span>X / Z / C</span></h3><p>Delikatnie potrząśnij stołem. Trzy szybkie potrząśnięcia to tilt: flippery, punkty i bonus milkną do następnej kuli.</p></section><section><h3>Pauza · Pełny ekran<span>P / Esc · F</span></h3><p>Przełączenie okna wstrzymuje grę automatycznie.</p></section></div><button class="garden-button" data-action="resume"><span>Rozumiem</span><b>↗</b></button>`;
  if (kind === 'sound') {
    content.innerHTML = emblem + `<p class="eyebrow">DŹWIĘKI NOCNEGO OGRODU</p><h2>Twój spokojny mix.</h2><p>Muzyka ogrodu, szum wody i delikatne dźwięki mechaniki.</p>${[['master', 'Master'], ['music', 'Music'], ['sfx', 'SFX']].map(([id, label]) => `<label class="volume">${label}<input type="range" min="0" max="100" value="${Math.round(audio.settings[id] * 100)}" data-volume="${id}" aria-label="${label}"><output>${Math.round(audio.settings[id] * 100)}%</output></label>`).join('')}<label for="reduce-motion"><input id="reduce-motion" type="checkbox" ${renderer.reducedMotion ? 'checked' : ''}> Ogranicz płatki, smugi i ruch ekranu</label><button class="garden-button" data-action="resume"><span>Gotowe</span><b>↗</b></button>`;
    content.querySelectorAll('[data-volume]').forEach(el => el.addEventListener('input', () => { audio.settings[el.dataset.volume] = Number(el.value) / 100; el.nextElementSibling.textContent = `${el.value}%`; audio.apply(); storage.write('night-garden-audio', audio.settings); }));
    $('reduce-motion').addEventListener('change', e => { renderer.reducedMotion = e.target.checked; document.body.classList.toggle('reduced-motion', e.target.checked); storage.write('night-garden-motion', e.target.checked); });
  }
  content.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.action === 'resume') closeDialog();
    if (button.dataset.action === 'restart') showDialog('restart');
    if (button.dataset.action === 'new') { persist(); begin(); }
  }));
  if (!dialog.open) dialog.showModal(); updateUI();
}
function togglePause() { if (game.state === 'playing') showDialog('pause'); else if (game.state === 'paused') closeDialog(); }
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { game.message('TRYB PEŁNEGO OKNA', 'Ta przeglądarka nie udostępnia pełnego ekranu. Gra nadal wykorzystuje całe okno.', 'notice'); }
}
const leftKeys = new Set(['KeyA', 'ArrowLeft', 'ShiftLeft']), rightKeys = new Set(['KeyD', 'ArrowRight', 'ShiftRight']);
const held = new Set();
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  const code = e.code;
  if (leftKeys.has(code) || rightKeys.has(code) || ['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(code) && !e.target.closest?.('dialog')) { if (code !== 'Tab') e.preventDefault(); }
  if (e.repeat) return;
  held.add(code);
  if (code === 'KeyF') { fullscreen(); return; }
  if (code === 'Escape' || code === 'KeyP') { e.preventDefault(); if ($('menu-dialog').open) closeDialog(); else togglePause(); return; }
  if ($('menu-dialog').open) return;
  if (leftKeys.has(code)) game.setFlipper('left', true);
  if (rightKeys.has(code)) game.setFlipper('right', true);
  if (code === 'Space') { if (game.state === 'attract' || game.state === 'gameover') begin(); else game.beginLaunch(); }
  if (code === 'KeyX' || code === 'KeyZ' || code === 'KeyC') game.nudge(code === 'KeyZ' ? -1 : code === 'KeyC' ? 1 : 0);
});
window.addEventListener('keyup', e => {
  held.delete(e.code);
  if (leftKeys.has(e.code)) game.setFlipper('left', [...held].some(k => leftKeys.has(k)));
  if (rightKeys.has(e.code)) game.setFlipper('right', [...held].some(k => rightKeys.has(k)));
  if (e.code === 'Space') game.releaseLaunch();
});
function lostFocus() { held.clear(); if (game.state === 'playing') showDialog('pause'); }
window.addEventListener('blur', lostFocus);
document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); lostFocus(); } });
window.addEventListener('pagehide', persist);
$('start-button').addEventListener('click', begin); $('pause-button').addEventListener('click', togglePause);
$('help-button').addEventListener('click', () => showDialog('help')); $('sound-button').addEventListener('click', () => showDialog('sound')); $('fullscreen-button').addEventListener('click', fullscreen);
$('menu-dialog').querySelector('.close-dialog').addEventListener('click', () => closeDialog());
$('menu-dialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
function touchHold(id, start, end) {
  const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); start(); });
  el.addEventListener('pointerup', e => { e.preventDefault(); end(); }); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  el.addEventListener('click', e => { if (e.detail === 0) { start(); setTimeout(end, 90); } });
}
touchHold('touch-left', () => game.setFlipper('left', true), () => game.setFlipper('left', false));
touchHold('touch-right', () => game.setFlipper('right', true), () => game.setFlipper('right', false));
touchHold('touch-launch', () => game.beginLaunch(), () => game.releaseLaunch()); $('touch-nudge').addEventListener('pointerdown', () => game.nudge());
window.addEventListener('resize', () => renderer?.resize());
document.addEventListener('fullscreenchange', () => {
  const active = !!document.fullscreenElement;
  $('fullscreen-button').setAttribute('aria-pressed', String(active));
  $('fullscreen-button').setAttribute('aria-label', active ? 'Opuść pełny ekran' : 'Pełny ekran');
  $('fullscreen-button').title = active ? 'Opuść pełny ekran (F)' : 'Pełny ekran (F)';
  renderer?.resize();
});
async function load() {
  // An entry may name its own extension; anything else is a PNG sprite.
  const assets = Object.fromEntries(await Promise.all(ASSETS.map(async entry => {
    const file = entry.includes('.') ? entry : `${entry}.png`;
    const name = file.replace(/\.[a-z]+$/, '');
    const img = new Image(); img.src = `public/${file}`; await img.decode(); return [name, img];
  })));
  renderer = new Renderer($('table'), game, assets); renderer.reducedMotion = !!reduced;
  $('start-button').disabled = false; $('start-button').querySelector('span').textContent = 'Wejdź do ogrodu';
  updateUI();
  let previous = performance.now();
  function frame(now) {
    const dt = Math.min((now - previous) / 1000, .1); previous = now;
    if (game.state === 'paused' && $('message').classList.contains('visible')) messageUntil += dt * 1000;
    const workStart = performance.now();
    game.update(dt); renderer.draw(game.state === 'paused' ? 0 : dt); audio.tick(game.state === 'playing', game.multiball ? 2 : game.koiUntil > game.time ? 1 : 0);
    renderer.metrics = { frameMs: dt * 1000, workMs: performance.now() - workStart };
    if (now > messageUntil) $('message').classList.remove('visible');
    if (now - lastUi > 70) { updateUI(); lastUi = now; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('qa')) {
    const { mountQA } = await import('./qa.js'); mountQA(game, renderer, audio, updateUI);
  }
}
load().catch(error => { console.error('Garden load failed', error); $('load-error').hidden = false; });

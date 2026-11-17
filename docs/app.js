import { makeBoard, canPlace, playRound, dateKey, hashStr, MINES } from './engine.js';
import * as sfx from './sound.js';

const $ = id => document.getElementById(id);
const ART = n => `art/${n}.webp`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let speed = 1;
const wait = ms => sleep(ms * speed);

const today = dateKey();
const state = {
  mode: 'daily',
  board: makeBoard(`daily:${today}`),
  mines: new Set(),
  playing: false,
  cells: [],
};

// ---------- the sweeper's face and words ----------
function kid(pose, motion = '') {
  const k = $('kid');
  if (!k.src.endsWith(ART(`kid-${pose}`))) k.src = ART(`kid-${pose}`);
  k.className = 'kid' + (motion ? ' ' + motion : '');
  if (motion === 'shake' || motion === 'jump') { void k.offsetWidth; }
}
function say(text, { tense = false, label = 'SWEEPER' } = {}) {
  const b = $('bubble');
  b.classList.remove('on');
  b.classList.toggle('tense', tense);
  b.replaceChildren();
  const s = document.createElement('small'); s.textContent = label;
  b.append(s, document.createTextNode(text));
  requestAnimationFrame(() => b.classList.add('on'));
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- the board ----------
function build() {
  const { board } = state;
  const el = $('board');
  el.replaceChildren();
  el.classList.remove('playing');
  state.cells = [];
  const N = board.n * board.n;
  const safe = new Set(board.safe), rocks = new Set(board.rocks);
  for (let i = 0; i < N; i++) {
    const c = document.createElement('button');
    c.className = 'cell';
    c.setAttribute('role', 'gridcell');
    c.dataset.i = i;
    if (i === board.pad) c.classList.add('pad');
    else if (rocks.has(i)) { c.classList.add('rock'); c.setAttribute('aria-label', 'Rock'); c.disabled = true; }
    else if (safe.has(i)) c.classList.add('safe');
    c.addEventListener('click', () => toggle(i));
    el.append(c);
    state.cells.push(c);
  }
  refresh();
}
function setImg(c, name) {
  c.replaceChildren();
  if (!name) return;
  const im = document.createElement('img'); im.src = ART(name); im.alt = ''; c.append(im);
}
function toggle(i) {
  if (state.playing || state.done) return;
  const { board, mines } = state;
  const c = state.cells[i];
  if (!canPlace(board, i)) {
    sfx.click();
    if (i === board.pad || board.safe.includes(i)) say('That’s my landing zone. No mines right next to it, please!');
    return;
  }
  if (mines.has(i)) { mines.delete(i); setImg(c, null); c.classList.remove('mine'); sfx.remove(); }
  else {
    if (mines.size >= MINES) { say(`That’s all ${MINES}. Tap a mine to move it.`); sfx.click(); return; }
    mines.add(i); setImg(c, 'mine'); c.classList.add('mine'); sfx.place();
  }
  refresh();
}
function refresh() {
  const left = MINES - state.mines.size;
  $('left').textContent = left;
  $('go').disabled = left !== 0 || state.playing;
  $('clear').disabled = state.playing || !state.mines.size;
  $('go').disabled = $('go').disabled || state.done;
  if (!state.playing && !state.done) $('status').textContent = left === MINES ? `Hide your ${MINES} mines` : left ? `Hide ${plural(left, 'more mine')}` : 'Ready when you are';
}

// ---------- words for each move ----------
function words(step, nums) {
  const r = step.reason || {};
  const n = r.from != null ? nums[r.from] : null;
  if (r.why === 'zero') return 'Nothing around here. Clear!';
  if (r.why === 'done') return `That ${n} already has ${plural(n, 'mine')} next to it. The rest are safe.`;
  if (r.why === 'full') return n === step.cells.length
    ? `That ${n} touches exactly ${plural(n, 'square')}. All mines. Flagging.`
    : `That ${n} can only be finished one way. Flagging.`;
  if (r.why === 'subset') return step.kind === 'flag'
    ? 'These two numbers overlap… so the extra one has to be a mine.'
    : 'These two numbers overlap… so the extra squares are safe.';
  if (r.why === 'deep') return step.kind === 'flag'
    ? 'I checked every possibility. That one is a mine, no doubt.'
    : 'I checked every possibility. That one can’t be a mine.';
  return 'Hmm.';
}

// ---------- playing a round ----------
async function go() {
  if (state.playing || state.mines.size !== MINES) return;
  state.playing = true;
  $('board').classList.add('playing');
  $('result').hidden = true;
  refresh();
  const tie = hashStr(state.board.seed + [...state.mines].sort((a, b) => a - b).join(','));
  const round = playRound(state.board, state.mines, tie);
  const { nums } = round;
  let taps = 0;
  const showTaps = () => { $('taps').textContent = taps; };
  // Hide your mines from view while the sweeper works.
  for (const i of state.mines) { setImg(state.cells[i], null); state.cells[i].classList.remove('mine'); }

  $('status').textContent = 'Sweeping…';
  kid('thinking', 'bob');
  say('Landing on the pad. Let’s see what you’ve done…');
  await wait(1100);

  const open = cells => cells.forEach((i, k) => {
    const c = state.cells[i];
    c.classList.add('open'); c.classList.remove('safe', 'pad');
    if (nums[i]) { c.textContent = nums[i]; c.classList.add('n' + nums[i]); } else c.textContent = '';
    if (k < 12) setTimeout(() => sfx.pop(k), k * 18 * speed);
  });

  for (const step of round.steps) {
    if (step.kind === 'land') { taps++; showTaps(); open(step.cells); await wait(700); continue; }
    if (step.kind === 'cleared') break;
    const from = step.reason?.from;
    const pair = step.reason?.pair;
    if (step.kind === 'open' || step.kind === 'flag') {
      kid('thinking');
      const hl = [from, pair].filter(x => x != null).map(i => state.cells[i]);
      hl.forEach(c => c.classList.add('think'));
      say(words(step, nums));
      sfx.think();
      // Easy moves zip by; the interesting ones linger a little.
      const easy = step.reason?.why === 'zero' || step.reason?.why === 'done';
      await wait(easy ? 420 : 900);
      if (step.kind === 'open') { taps += Math.max(1, step.cells.length ? 1 : 0); open(step.cells); }
      else { step.cells.forEach(i => { setImg(state.cells[i], 'flag'); state.cells[i].classList.add('flagged'); }); sfx.flag(); }
      showTaps();
      hl.forEach(c => c.classList.remove('think'));
      await wait(easy ? 220 : 380);
      continue;
    }
    if (step.kind === 'guess') {
      // The tense part: slow down.
      taps++;
      const pct = Math.round(step.chance * 100);
      const fifty = Math.abs(step.chance - 0.5) < 0.01;
      kid('sweating', 'bob');
      $('status').textContent = 'No sure moves…';
      say(fifty ? 'It’s fifty-fifty. Nothing left to work out…' : `No sure moves left. This one’s a ${pct}% risk…`, { tense: true });
      await wait(1500);
      const c = state.cells[step.cell];
      c.classList.add('target');
      kid('guessing');
      say('Here goes…', { tense: true });
      sfx.drumroll(1.3 * speed);
      await wait(1400);
      c.classList.remove('target');
      showTaps();
      if (step.boom) return finish(round, taps, step.cell);
      open(step.cells);
      sfx.phew();
      kid('thinking');
      say(pct >= 30 ? 'PHEW. Okay. Okay. Keep going.' : 'Phew!');
      $('status').textContent = 'Sweeping…';
      await wait(800);
    }
  }
  return finish(round, taps, null);
}

function finish(round, taps, at) {
  const { mines, nums } = round;
  const total = state.board.n * state.board.n - state.board.rocks.length - MINES;
  if (at != null) {
    const c = state.cells[at];
    setImg(c, 'mine'); c.classList.add('boom');
    sfx.boom();
    $('board').classList.remove('shake'); void $('board').offsetWidth; $('board').classList.add('shake');
    kid('boom', 'shake');
    say('…ow.', { label: 'SWEEPER' });
  } else {
    sfx.win();
    kid('victory', 'jump');
    say('Cleared it! Nice try though.');
  }
  // Show where your mines were.
  for (const i of mines) if (i !== at && !state.cells[i].classList.contains('flagged')) { setImg(state.cells[i], 'mine'); state.cells[i].classList.add('reveal'); }
  $('status').textContent = at != null ? 'Gotcha!' : 'Field cleared';
  state.playing = false;
  state.done = true;
  refresh();
  $('clear').disabled = true;
  showResult(round, taps, at, total, nums);
}

// ---------- result + share ----------
function showResult(round, taps, at, total, nums) {
  const won = at != null;
  const opened = state.cells.filter(c => c.classList.contains('open')).length;
  const left = Math.max(0, total - opened);
  const pct = Math.round((left / total) * 100);
  $('resultKid').src = ART(won ? 'kid-boom' : 'kid-victory');
  $('resultTitle').textContent = won ? 'Gotcha! Your trap worked.' : 'The sweeper cleared your field.';
  $('resultText').textContent = won
    ? `Caught on tap ${taps}, with ${pct}% of the field still covered.`
    : `It read every number and never had to gamble on a mine. Try making it guess.`;
  // A little emoji map of how it went, without giving away your mine spots.
  const rows = [];
  const n = state.board.n, rocks = new Set(state.board.rocks);
  for (let r = 0; r < n; r++) {
    let s = '';
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      s += i === at ? '💥' : rocks.has(i) ? '⬛' : state.cells[i].classList.contains('open') ? '🟩' : '⬜';
    }
    rows.push(s);
  }
  const grid = rows.join('\n');
  $('shareGrid').textContent = grid;
  const label = state.mode === 'daily' ? `Daily ${today}` : 'Random board';
  state.share = won
    ? `Fifty-Fifty · ${label}\nCaught the sweeper on tap ${taps} 💣\n${grid}\n${location.href.split('#')[0]}`
    : `Fifty-Fifty · ${label}\nThe sweeper cleared my field in ${taps} taps 🧹\n${grid}\n${location.href.split('#')[0]}`;
  $('copied').hidden = true;
  $('result').hidden = false;
  if (won && state.mode === 'daily') {
    try {
      const best = +localStorage.getItem('ff-best-' + today) || Infinity;
      if (taps < best) localStorage.setItem('ff-best-' + today, taps);
    } catch { /* fine */ }
  }
  setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
}

function reset(newBoard) {
  if (newBoard) state.board = newBoard;
  state.mines = new Set();
  state.done = false;
  $('taps').textContent = 0;
  $('result').hidden = true;
  build();
  kid('thinking', 'bob');
}

// ---------- wiring ----------
$('go').addEventListener('click', go);
$('clear').addEventListener('click', () => { if (!state.playing) { reset(); sfx.remove(); } });
$('again').addEventListener('click', () => { reset(); say('Another trap? Bring it on.'); });
$('free').addEventListener('click', () => {
  state.mode = 'free';
  $('mode').textContent = 'Random board';
  reset(makeBoard('free:' + Date.now() + ':' + Math.random()));
  say('New field. Same me. Hide your mines.');
});
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.share); $('copied').hidden = false; }
  catch { $('shareGrid').textContent = state.share; $('copied').hidden = false; $('copied').textContent = 'Select the text above to copy it.'; }
});
$('help').addEventListener('click', () => $('how').showModal());
$('howClose').addEventListener('click', () => $('how').close());
const snd = $('sound');
const paintSound = () => { snd.textContent = sfx.soundOn() ? '🔊' : '🔇'; snd.setAttribute('aria-pressed', sfx.soundOn()); };
snd.addEventListener('click', () => { sfx.setSound(!sfx.soundOn()); paintSound(); });
paintSound();
// Hold Shift (or add #fast) to speed the sweeper up.
if (location.hash === '#fast') speed = 0.35;
addEventListener('keydown', e => { if (e.key === 'Shift') speed = 0.35; });
addEventListener('keyup', e => { if (e.key === 'Shift' && location.hash !== '#fast') speed = 1; });

// ---------- start: the old grid wakes up ----------
build();
$('mode').textContent = `Daily board · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
let woke = false;
const wakeUp = () => {
  if (woke) return; woke = true;
  document.body.classList.add('waking');
  document.body.classList.remove('old');
  sfx.wake();
  setTimeout(() => document.body.classList.remove('waking'), 800);
  setTimeout(() => {
    kid('thinking', 'bob');
    say(`You remember this game. This time, you hide the ${MINES} mines. I’ll try to clear the field.`);
  }, 650);
};
setTimeout(wakeUp, 1300);
document.addEventListener('pointerdown', wakeUp, { once: true });

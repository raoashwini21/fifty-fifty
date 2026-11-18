import { makeBoard, canPlace, playRound, trapOdds, dateKey, hashStr } from './engine.js';
import * as sfx from './sound.js';

const $ = id => document.getElementById(id);
const ART = n => `art/${n}.webp`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let speed = 1;
const wait = ms => sleep(ms * speed);
const M = () => state.board.mines;

const today = dateKey();
// Five hand-picked boards, easiest first. Each one has a trap that works;
// the later ones hide it better.
// Hints fade and moves shrink as you go: full meter → words only → warmer/colder → silence.
// Placing your mines is free; every mine you pick back up costs one move.
const LEVELS = [
  { hints: 'full', swaps: Infinity, seed: 'level:29', tip: 'Tip: I can’t see past rocks. Mines tucked behind them are hard for me to read.' },
  { hints: 'full', swaps: 6, seed: 'level:5', tip: 'Tip: the edges are where I have the fewest numbers to go on.' },
  { hints: 'words', swaps: 4, seed: 'level:17', tip: 'Tip: if two squares look exactly the same to me, I have to flip a coin.' },
  { hints: 'vague', swaps: 2, seed: 'level:13', tip: 'Tip: only one rock this time. You’ll need more than a corner.' },
  { hints: 'none', swaps: 0, seed: 'level:39', tip: 'Last one. Only the sneakiest trap works here. Good luck.' },
];
const RULES = { daily: { hints: 'vague', swaps: 2 }, free: { hints: 'full', swaps: Infinity } };
const rule = () => state.mode === 'levels' ? LEVELS[state.level] : RULES[state.mode];
const swapsLeft = () => rule().swaps - state.swapsUsed;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: progress lasts this visit */ } },
};
const progress = { done: store.get('ff-levels', []) };
const firstOpen = Math.min(progress.done.length, LEVELS.length - 1);
const state = {
  mode: 'levels',
  level: firstOpen,
  attempt: 0,
  board: makeBoard(LEVELS[firstOpen].seed),
  mines: new Set(),
  swapsUsed: 0,
  playing: false,
  cells: [],
};

// ---------- the sweeper's face and words ----------
// While you hide mines he can't see: blindfold on. Until that pose is
// painted, the eyes-shut pose stands in.
let hasBlindfold = false;
{ const im = new Image(); im.onload = () => { hasBlindfold = true; if (!state.playing && !state.done) kid('blindfold', 'bob'); }; im.src = ART('kid-blindfold'); }
function kid(pose, motion = '') {
  const k = $('kid');
  if (pose === 'blindfold' && !hasBlindfold) pose = 'guessing';
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
  if (mines.has(i)) {
    if (swapsLeft() <= 0) {
      sfx.click();
      mineSay(rule().swaps ? 'Out of moves! We stay put now. Press Go 😈' : 'No take-backs this level! Where we land is where we stay.', 'warm');
      return;
    }
    state.swapsUsed++;
    mines.delete(i); setImg(c, null); c.classList.remove('mine'); sfx.remove(); }
  else {
    if (mines.size >= M()) { say(`That’s all ${M()}. Tap a mine to move it.`); sfx.click(); return; }
    mines.add(i); setImg(c, 'mine'); c.classList.add('mine'); sfx.place();
  }
  refresh();
  react();
}

// The kid is blindfolded while you build the trap, so a little mine
// whispers to you instead, and gets more excited as the trap gets better.
let lastBand = null;
function mineSay(text, mood) {
  $('mineText').textContent = text;
  const m = $('mineBuddy');
  m.className = 'mine-buddy ' + (mood || '');
  void m.offsetWidth; m.classList.add('talk');
}
function react() {
  const left = M() - state.mines.size;
  if (left) {
    if (lastBand !== 'placing') kid('blindfold', 'bob');
    lastBand = 'placing';
    const sw = rule().swaps;
    const rules = sw === Infinity ? '' : sw === 0 ? ' No take-backs this level!' : ` You can move us ${sw} times.`;
    const quiet = { full: '', words: ' No numbers this time, just my gut.', vague: ' I’ll only say warmer or colder.', none: ' And I’m saying nothing. 🤐' }[rule().hints];
    mineSay(left === M() && !state.swapsUsed
      ? `Psst! Hide us ${M()} mines. He can’t see a thing.${rules}${quiet}`
      : left === 1 ? 'One more of us. Make it count!' : pick(['Ooh, nice spot.', 'Hehe. Keep going.', `${left} more of us to hide.`]), 'calm');
    return;
  }
  const pct = state.lastPct ?? 0;
  const g = state.lastGuesses ?? 0;
  const hints = rule().hints;
  if (hints === 'none') { lastBand = 'none'; mineSay('🤐 …', 'calm'); return; }
  if (hints === 'vague') {
    const prev = state.prevPct;
    state.prevPct = pct;
    lastBand = 'vague';
    if (prev == null) mineSay('Hmm… could be anything. Move one of us and I’ll tell you warmer or colder.', 'calm');
    else if (pct > prev) mineSay(pick(['Warmer… 🔥', 'Ooh, warmer!', 'Warmer. I like this.']), 'warm');
    else if (pct < prev) mineSay(pick(['Colder… 🧊', 'Brr, colder.', 'Nope, colder.']), 'calm');
    else mineSay('Same as before. Hmm.', 'calm');
    return;
  }
  const band = pct === 0 ? 'easy' : pct < 50 ? 'unsure' : pct < 100 ? 'nasty' : 'perfect';
  if (band === lastBand) return;
  sfx.meterTone(pct);
  lastBand = band;
  if (band === 'easy') mineSay('Hmm. He’ll read that easily. Box him in so the numbers can’t help!', 'calm');
  if (band === 'unsure') mineSay(hints === 'full' ? `Ooh, he’ll have to guess ${g === 1 ? 'once' : g + ' times'}. Can we make it worse for him?` : 'Ooh, he might have to guess. Can we make it worse?', 'warm');
  if (band === 'nasty') mineSay('Hehehe, that’s nasty. He’ll be sweating. 😈', 'hot');
  if (band === 'perfect') mineSay('PERFECT trap! Every safe-looking square is one of us. Press Go!', 'hot wild');
}
const pick = list => list[Math.floor(Math.random() * list.length)];
function meter() {
  const el = $('meter'), fill = $('meterFill'), txt = $('meterText');
  if (state.playing || state.done) return;
  const left = M() - state.mines.size;
  el.classList.remove('hot', 'warm');
  el.classList.toggle('quiet', rule().hints !== 'full');
  if (left) {
    fill.style.width = '0%';
    txt.textContent = `${state.mines.size} of ${M()} placed`;
    return;
  }
  const o = trapOdds(state.board, state.mines);
  const pct = Math.round(o.catchChance * 100);
  state.lastPct = pct;
  state.lastGuesses = o.guesses;
  fill.style.width = Math.max(4, pct) + '%';
  if (pct >= 60) el.classList.add('hot'); else if (pct > 0) el.classList.add('warm');
  txt.textContent = !o.guesses ? '0% · no guesses' : `${pct}% · ${o.guesses} ${o.guesses === 1 ? 'guess' : 'guesses'}`;
}
function refresh() {
  const left = M() - state.mines.size;
  $('left').textContent = left;
  $('go').disabled = left !== 0 || state.playing;
  $('clear').disabled = state.playing || !state.mines.size || swapsLeft() < state.mines.size;
  if (!state.playing && !state.done) {
    $('tapsLabel').textContent = 'MOVES';
    $('tapsBox').title = 'Moves left: picking a mine back up costs one';
    $('taps').textContent = swapsLeft() === Infinity ? '∞' : swapsLeft();
    $('tapsBox').classList.toggle('out', swapsLeft() <= 0);
  }
  $('go').disabled = $('go').disabled || state.done;
  meter();
  if (!state.playing && !state.done) $('status').textContent = left === M() ? `Hide your ${M()} mines` : left ? `Hide ${plural(left, 'more mine')}` : 'Ready when you are';
}

// ---------- words for each move ----------
function words(step, nums) {
  const r = step.reason || {};
  const n = r.from != null ? nums[r.from] : null;
  const k = step.cells?.length || 0;
  if (r.why === 'zero') return { say: 'A blank square means no mines around it. Opening everything next to it.', log: 'Blank square → opened its neighbours' };
  if (r.why === 'done') return {
    say: `This ${n} already has ${plural(n, 'flagged mine')} next to it. So the other ${plural(k, 'square')} must be safe.`,
    log: `The ${n} is complete → ${plural(k, 'safe square')}`,
  };
  if (r.why === 'full') return {
    say: n === 1
      ? 'This 1 needs one mine, and only one hidden square touches it. That’s the mine. Flagging.'
      : `This ${n} needs ${n} mines, and exactly ${n} hidden squares are left around it. All mines. Flagging.`,
    log: `The ${n} needs every square → ${plural(k, 'flag')}`,
  };
  if (r.why === 'subset') return step.kind === 'flag'
    ? { say: 'These two numbers share squares. Comparing them, the extra one has to be a mine.', log: 'Compared two numbers → flag' }
    : { say: 'These two numbers share squares. Comparing them, the extra squares are safe.', log: 'Compared two numbers → safe' };
  if (r.why === 'deep') return step.kind === 'flag'
    ? { say: 'I tried every way the mines could fit. This one is a mine in all of them.', log: 'Checked every option → flag' }
    : { say: 'I tried every way the mines could fit. This one is never a mine.', log: 'Checked every option → safe' };
  return { say: 'Hmm.', log: '' };
}

let moveNo = 0;
function log(text, kind = '') {
  const li = document.createElement('li');
  li.className = kind;
  li.innerHTML = '';
  const b = document.createElement('b'); b.textContent = ++moveNo;
  li.append(b, document.createTextNode(' ' + text));
  $('moves').prepend(li);
}
const mark = (cells, cls) => cells.forEach(i => state.cells[i].classList.add(cls));
const unmark = cls => state.cells.forEach(c => c.classList.remove(cls));

// ---------- playing a round ----------
async function go() {
  if (state.playing || state.mines.size !== M()) return;
  state.playing = true;
  state.lastMines = new Set(state.mines);
  $('board').classList.add('playing');
  $('result').hidden = true;
  $('moves').replaceChildren(); moveNo = 0;
  $('movesBox').hidden = false;
  refresh();
  $('tapsLabel').textContent = 'TAPS'; $('tapsBox').title = 'Sweeper’s taps'; $('taps').textContent = 0; $('tapsBox').classList.remove('out');
  state.attempt++;
  const tie = hashStr(state.board.seed + [...state.mines].sort((a, b) => a - b).join(',') + ':' + state.attempt);
  const round = playRound(state.board, state.mines, tie);
  const { nums } = round;
  let taps = 0;
  const showTaps = () => { $('taps').textContent = taps; };
  // Hide your mines from view while the sweeper works.
  for (const i of state.mines) { setImg(state.cells[i], null); state.cells[i].classList.remove('mine'); }

  const open = cells => cells.forEach((i, k) => {
    const c = state.cells[i];
    c.classList.add('open'); c.classList.remove('safe', 'pad');
    if (nums[i]) { c.textContent = nums[i]; c.classList.add('n' + nums[i]); } else c.textContent = '';
    if (k < 10) setTimeout(() => sfx.pop(k), k * 30 * speed);
  });

  $('status').textContent = 'Blindfold off…';
  mineSay('Shh! He’s coming. 🤫', 'calm');
  kid('thinking', 'jump');
  sfx.wake();
  say('Okay, blindfold off! Let’s see what you did…');
  await wait(1500);
  $('status').textContent = 'Sweeping…';
  mark([state.board.pad], 'aim');
  say('I always start on the pad. It’s safe.');
  await wait(1300);
  unmark('aim');

  for (const step of round.steps) {
    if (step.kind === 'land') {
      taps++; showTaps(); open(step.cells);
      log(`Landed on START → opened ${plural(step.cells.length, 'square')}`, 'open');
      await wait(1200);
      continue;
    }
    if (step.kind === 'cleared') break;
    if (step.kind === 'open' || step.kind === 'flag') {
      const r = step.reason || {};
      const w = words(step, nums);
      kid('thinking');
      // 1. Show what he's looking at.
      mark([r.from, r.pair].filter(x => x != null), 'think');
      say(w.say);
      sfx.think();
      await wait(1100);
      // 2. Show what he's about to do.
      mark(step.cells.filter(i => step.kind === 'flag' || !state.cells[i].classList.contains('open')), step.kind === 'flag' ? 'aim-flag' : 'aim');
      await wait(900);
      // 3. Do it.
      if (step.kind === 'open') { taps++; open(step.cells); }
      else { step.cells.forEach(i => { setImg(state.cells[i], 'flag'); state.cells[i].classList.add('flagged'); }); sfx.flag(); }
      showTaps();
      log(w.log, step.kind);
      await wait(700);
      unmark('think'); unmark('aim'); unmark('aim-flag');
      await wait(250);
      continue;
    }
    if (step.kind === 'guess') {
      taps++;
      const pct = Math.round(step.chance * 100);
      const fifty = Math.abs(step.chance - 0.5) < 0.01;
      kid('sweating', 'bob');
      $('status').textContent = 'No sure moves…';
      say(fifty
        ? 'Every number is stuck. These squares are a coin flip. Fifty-fifty…'
        : `Every number is stuck. No square is certain. Safest pick is a ${pct}% risk…`, { tense: true });
      await wait(2000);
      const c = state.cells[step.cell];
      c.classList.add('target');
      kid('guessing');
      say('Here goes…', { tense: true });
      sfx.drumroll(1.4 * speed);
      await wait(1500);
      c.classList.remove('target');
      showTaps();
      if (step.boom) { log(`Forced to guess (${pct}% risk) → 💥`, 'boom'); return finish(round, taps, step.cell); }
      open(step.cells);
      log(`Forced to guess (${pct}% risk) → survived`, 'guess');
      sfx.phew();
      kid('thinking');
      say(pct >= 30 ? 'PHEW. Okay. Okay. Keep going.' : 'Phew!');
      $('status').textContent = 'Sweeping…';
      await wait(1100);
    }
  }
  log('Field cleared', 'open');
  return finish(round, taps, null);
}

function finish(round, taps, at) {
  const { mines, nums } = round;
  const total = state.board.n * state.board.n - state.board.rocks.length - M();
  if (at != null) {
    const c = state.cells[at];
    setImg(c, 'mine'); c.classList.add('boom');
    sfx.boom();
    $('board').classList.remove('shake'); void $('board').offsetWidth; $('board').classList.add('shake');
    kid('boom', 'shake');
    mineSay('GOTCHA! 😈 That’s one of us he stepped on.', 'hot wild');
    say('…ow.', { label: 'SWEEPER' });
  } else {
    sfx.win();
    kid('victory', 'jump');
    mineSay(state.lastPct > 0 ? 'Aww, he got lucky. Same trap again?' : 'He read us all. We need a sneakier hiding spot.', 'calm');
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
  state.lastWon = won;
  const opened = state.cells.filter(c => c.classList.contains('open')).length;
  const left = Math.max(0, total - opened);
  const pct = Math.round((left / total) * 100);
  $('resultKid').src = ART(won ? 'kid-boom' : 'kid-victory');
  const lv = state.mode === 'levels' ? state.level : -1;
  const last = lv === LEVELS.length - 1;
  $('resultTitle').textContent = won
    ? (lv >= 0 ? (last ? 'You beat every level! 🏆' : `Gotcha! Level ${lv + 2} unlocked.`) : 'Gotcha! Your trap worked.')
    : 'The sweeper cleared your field.';
  if (won && lv >= 0 && !progress.done.includes(lv)) { progress.done.push(lv); store.set('ff-levels', progress.done); paintLevels(); }
  $('next').hidden = !(won && lv >= 0 && !last);
  $('again').textContent = won ? 'New trap' : 'Try again';
  // Stars for a tidy trap: fewer mines picked back up is better.
  const budget = rule().swaps, used = state.swapsUsed;
  const stars = !won ? 0 : used === 0 ? 3 : used <= (budget === Infinity ? 2 : Math.max(1, Math.floor(budget / 2))) ? 2 : 1;
  const starLine = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const reveal = rule().hints !== 'full' ? ` Your trap was ${state.lastPct}% deadly.` : '';
  $('resultText').textContent = won
    ? `${starLine}  ${used ? plural(used, 'move') : 'No moves'} used. Caught on tap ${taps}, with ${pct}% of the field still covered.${reveal}`
    : state.lastPct > 0
      ? `Your trap gave you a ${state.lastPct}% chance, and he got lucky this time. Same mines, try again?`
      : rule().hints === 'full'
        ? 'He read every number and never had to guess. Use the trap meter to box him in.'
        : 'He read every number and never had to guess. Your trap was 0% deadly. Hide us behind rocks and edges.';
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
  const label = state.mode === 'daily' ? `Daily ${today}` : state.mode === 'levels' ? `Level ${state.level + 1}` : 'Random board';
  state.share = won
    ? `Fifty-Fifty · ${label} ${starLine}\nCaught the sweeper on tap ${taps} 💣\n${grid}\n${location.href.split('#')[0]}`
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

function reset(newBoard, keep = null) {
  if (newBoard) { state.board = newBoard; state.attempt = 0; }
  $('movesBox').hidden = true;
  state.mines = new Set(keep || []);
  state.swapsUsed = 0;
  state.prevPct = null;
  lastBand = null;
  state.done = false;
  $('result').hidden = true;
  build();
  for (const i of state.mines) { setImg(state.cells[i], 'mine'); state.cells[i].classList.add('mine'); }
  refresh();
  react();
}

// ---------- modes and levels ----------
function paintLevels() {
  const el = $('levels');
  el.replaceChildren();
  LEVELS.forEach((L, k) => {
    const open = k === 0 || progress.done.includes(k - 1) || progress.done.includes(k);
    const b = document.createElement('button');
    b.className = 'lvl' + (progress.done.includes(k) ? ' done' : '') + (state.mode === 'levels' && state.level === k ? ' on' : '');
    b.textContent = progress.done.includes(k) ? '★' : k + 1;
    b.disabled = !open;
    b.title = open ? `Level ${k + 1}` : 'Beat the level before to unlock';
    b.addEventListener('click', () => startLevel(k));
    el.append(b);
  });
  $('tabLevels').classList.toggle('on', state.mode === 'levels');
  $('tabDaily').classList.toggle('on', state.mode === 'daily');
  el.hidden = state.mode !== 'levels';
}
function startLevel(k) {
  state.mode = 'levels'; state.level = k;
  reset(makeBoard(LEVELS[k].seed));
  paintLevels();
  $('mode').textContent = `Level ${k + 1} of ${LEVELS.length}`;
  say(LEVELS[k].tip);
}
function startDaily() {
  state.mode = 'daily';
  reset(makeBoard(`daily:${today}`));
  paintLevels();
  $('mode').textContent = `Daily · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  say('Today’s board. Same for everyone. Show me your best trap.');
}

// ---------- wiring ----------
$('go').addEventListener('click', go);
$('clear').addEventListener('click', () => {
  if (state.playing || swapsLeft() < state.mines.size) return;
  const used = state.swapsUsed + state.mines.size;
  reset(); state.swapsUsed = used; refresh(); react(); sfx.remove();
});
$('again').addEventListener('click', () => {
  const won = state.lastWon;
  reset(null, won ? null : [...state.lastMines]);
  say(won ? 'Another trap? Bring it on.' : 'Same trap, new nerves. Go when ready.');
});
$('next').addEventListener('click', () => startLevel(state.level + 1));
$('tabLevels').addEventListener('click', () => startLevel(Math.min(progress.done.length, LEVELS.length - 1)));
$('tabDaily').addEventListener('click', startDaily);
const sp = $('speed');
sp.addEventListener('click', () => { speed = speed === 1 ? 0.45 : 1; sp.textContent = speed === 1 ? '1×' : '2×'; sp.setAttribute('aria-pressed', speed !== 1); });
$('free').addEventListener('click', () => {
  state.mode = 'free';
  paintLevels();
  $('levels').hidden = true;
  $('mode').textContent = 'Random board';
  reset(makeBoard('free:' + Date.now() + ':' + Math.random()));
  say('New field. Blindfold on. Hide your mines.');
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

// ---------- start: the old grid wakes up ----------
build();
paintLevels();
$('mode').textContent = `Level ${state.level + 1} of ${LEVELS.length}`;
let woke = false;
// The old game sits there for a moment, gets stamped REMIXED, and the stamp
// flies at you while everything wakes up into the new look.
const wakeUp = () => {
  if (woke) return; woke = true;
  const r = $('remixed');
  r.classList.add('stamp');
  sfx.place();
  setTimeout(() => {
    r.classList.remove('stamp'); r.classList.add('fly');
    document.body.classList.add('waking');
    document.body.classList.remove('old');
    sfx.wake();
  }, 1100);
  setTimeout(() => { document.body.classList.remove('waking'); r.remove(); }, 2700);
  setTimeout(() => {
    kid('blindfold', 'bob');
    say(state.level === 0 && !progress.done.length
      ? `You remember this game. This time YOU hide the ${M()} mines. I’m blindfolded, no peeking! Then I clear the field.`
      : LEVELS[state.level].tip);
    react();
  }, 2400);
};
setTimeout(wakeUp, 2200);
document.addEventListener('pointerdown', wakeUp, { once: true });

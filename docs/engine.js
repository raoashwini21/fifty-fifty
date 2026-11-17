// Fifty-Fifty engine: the board, your mines, and a sweeper that plays like a
// careful human. It never steps on a mine it could have worked out, and when
// it must guess it picks the square least likely to be a mine.
// Pure functions, no DOM: the page and the tests both use this file.

export const SIZE = 9;
export const MINES = 10;

// ---------- seeded randomness (same daily board for everyone) ----------
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idx = (r, c, n = SIZE) => r * n + c;
export function neighbours(i, n = SIZE) {
  const r = Math.floor(i / n), c = i % n, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(idx(rr, cc, n));
  }
  return out;
}

// ---------- the board ----------
// A board has a landing pad (where the sweeper starts) and a few rocks.
// The pad and the squares around it can't hold mines, like the classic
// "first click is always safe".
export function makeBoard(seedText) {
  const rand = rng(hashStr(seedText));
  const n = SIZE;
  const pr = 2 + Math.floor(rand() * (n - 4));
  const pc = 2 + Math.floor(rand() * (n - 4));
  const pad = idx(pr, pc);
  const safe = new Set([pad, ...neighbours(pad)]);
  const rocks = new Set();
  const want = 3 + Math.floor(rand() * 3);
  while (rocks.size < want) {
    const i = Math.floor(rand() * n * n);
    if (!safe.has(i)) rocks.add(i);
  }
  return { n, mines: MINES, pad, safe: [...safe], rocks: [...rocks], seed: seedText };
}

export function canPlace(board, i) {
  return !board.safe.includes(i) && !board.rocks.includes(i);
}

// ---------- counting ----------
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function numbers(board, mineSet) {
  const out = new Array(board.n * board.n).fill(0);
  for (const m of mineSet) for (const j of neighbours(m, board.n)) out[j]++;
  return out;
}

// ---------- what the sweeper knows ----------
// state: open (Set), flags (Set). The sweeper only ever sees open squares'
// numbers, the rocks, and how many mines there are in total.
function view(board, state, nums) {
  const N = board.n * board.n;
  const rocks = new Set(board.rocks);
  const hidden = [];
  for (let i = 0; i < N; i++) if (!state.open.has(i) && !rocks.has(i)) hidden.push(i);
  const constraints = [];
  for (const i of state.open) {
    const cells = neighbours(i, board.n).filter(j => !state.open.has(j) && !rocks.has(j));
    if (cells.length) constraints.push({ at: i, need: nums[i], cells });
  }
  return { hidden, constraints };
}

// Simple rules first, so the sweeper can explain itself in plain words.
function simpleMove(board, state, nums, cons) {
  for (const c of cons) {
    const flagged = c.cells.filter(j => state.flags.has(j));
    const open = c.cells.filter(j => !state.flags.has(j));
    if (!open.length) continue;
    if (flagged.length === c.need) {
      return { kind: 'safe', cells: open, from: c.at, why: c.need === 0 ? 'zero' : 'done', n: c.need };
    }
    if (c.need - flagged.length === open.length) {
      return { kind: 'flag', cells: open, from: c.at, why: 'full', n: c.need };
    }
  }
  // Two numbers side by side: if one's squares sit inside the other's, the
  // difference tells you something.
  for (const a of cons) for (const b of cons) {
    if (a === b) continue;
    const ao = a.cells.filter(j => !state.flags.has(j));
    const bo = b.cells.filter(j => !state.flags.has(j));
    if (!ao.length || ao.length >= bo.length) continue;
    if (!ao.every(j => bo.includes(j))) continue;
    const an = a.need - a.cells.filter(j => state.flags.has(j)).length;
    const bn = b.need - b.cells.filter(j => state.flags.has(j)).length;
    const rest = bo.filter(j => !ao.includes(j));
    if (an === bn) return { kind: 'safe', cells: rest, from: b.at, pair: a.at, why: 'subset' };
    if (bn - an === rest.length) return { kind: 'flag', cells: rest, from: b.at, pair: a.at, why: 'subset' };
  }
  return null;
}

// Every arrangement of mines that fits what's showing, weighted by how
// many ways the rest of the field can be filled. Returns each hidden
// square's chance of being a mine.
export function probabilities(board, state, nums) {
  const { hidden, constraints } = view(board, state, nums);
  const unknown = hidden.filter(i => !state.flags.has(i));
  const left = board.mines - state.flags.size;
  const cons = constraints.map(c => ({
    need: c.need - c.cells.filter(j => state.flags.has(j)).length,
    cells: c.cells.filter(j => !state.flags.has(j)),
  })).filter(c => c.cells.length);
  const front = [...new Set(cons.flatMap(c => c.cells))];
  const interior = unknown.filter(i => !front.includes(i));

  // Split the frontier into groups that don't share any number.
  const parent = new Map(front.map(i => [i, i]));
  const find = i => (parent.get(i) === i ? i : (parent.set(i, find(parent.get(i))), parent.get(i)));
  for (const c of cons) for (let k = 1; k < c.cells.length; k++) parent.set(find(c.cells[k]), find(c.cells[0]));
  const groups = new Map();
  for (const i of front) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }

  // For each group: by mine count k, how many arrangements, and how often each cell is a mine.
  const tables = [];
  for (const cells of groups.values()) {
    const gc = cons.filter(c => cells.includes(c.cells[0]));
    const pos = new Map(cells.map((c, j) => [c, j]));
    const byCell = cells.map(c => gc.filter(x => x.cells.includes(c)));
    const val = new Array(cells.length).fill(-1);
    const table = new Map();
    const rec = (j, k) => {
      if (j === cells.length) {
        let e = table.get(k); if (!e) { e = { count: 0, per: new Array(cells.length).fill(0) }; table.set(k, e); }
        e.count++; for (let q = 0; q < cells.length; q++) if (val[q] === 1) e.per[q]++;
        return;
      }
      for (const v of [0, 1]) {
        val[j] = v;
        if (byCell[j].every(c => {
          let m = 0, u = 0;
          for (const x of c.cells) { const vv = val[pos.get(x)]; if (vv === 1) m++; else if (vv === -1) u++; }
          return m <= c.need && m + u >= c.need;
        })) rec(j + 1, k + v);
      }
      val[j] = -1;
    };
    rec(0, 0);
    tables.push({ cells, table });
  }

  // Combine the groups: total weight for each total frontier mine count.
  let dist = new Map([[0, 1]]);
  for (const t of tables) {
    const next = new Map();
    for (const [k1, w1] of dist) for (const [k2, e] of t.table) next.set(k1 + k2, (next.get(k1 + k2) || 0) + w1 * e.count);
    dist = next;
  }
  const weightFor = k => choose(interior.length, left - k);
  let total = 0;
  for (const [k, w] of dist) total += w * weightFor(k);
  const prob = new Map();
  if (!total) { for (const i of unknown) prob.set(i, left / Math.max(1, unknown.length)); return prob; }

  // Per-cell chance inside each group: sum over that group's k, times the
  // other groups' combined weights.
  tables.forEach((t, ti) => {
    let others = new Map([[0, 1]]);
    tables.forEach((u, ui) => {
      if (ui === ti) return;
      const next = new Map();
      for (const [k1, w1] of others) for (const [k2, e] of u.table) next.set(k1 + k2, (next.get(k1 + k2) || 0) + w1 * e.count);
      others = next;
    });
    t.cells.forEach((cell, q) => {
      let s = 0;
      for (const [k, e] of t.table) for (const [ko, wo] of others) s += e.per[q] * wo * weightFor(k + ko);
      prob.set(cell, s / total);
    });
  });
  let interiorMines = 0;
  for (const [k, w] of dist) interiorMines += w * weightFor(k) * (left - k);
  for (const i of interior) prob.set(i, interior.length ? interiorMines / total / interior.length : 0);
  return prob;
}

// The sweeper's next move. One of:
//   { kind: 'open'|'flag', cells, reason }  a sure thing
//   { kind: 'guess', cell, chance, reason } no sure thing left
//   null                                     field cleared
export function nextMove(board, state, nums, tieSeed = 0) {
  const { hidden, constraints } = view(board, state, nums);
  const unknown = hidden.filter(i => !state.flags.has(i));
  if (unknown.length === board.mines - state.flags.size) return null; // only mines left: cleared
  const simple = simpleMove(board, state, nums, constraints);
  if (simple) {
    return { kind: simple.kind === 'safe' ? 'open' : 'flag', cells: simple.cells, reason: simple };
  }
  const prob = probabilities(board, state, nums);
  const sure0 = unknown.filter(i => prob.get(i) < 1e-9);
  if (sure0.length) return { kind: 'open', cells: sure0, reason: { why: 'deep' } };
  const sure1 = unknown.filter(i => prob.get(i) > 1 - 1e-9);
  if (sure1.length) return { kind: 'flag', cells: sure1, reason: { why: 'deep' } };
  // Guess: least likely to be a mine. Prefer squares touching what's open
  // (more information), then a seeded tie-break so it isn't predictable.
  const tr = rng(tieSeed);
  const touching = i => neighbours(i, board.n).some(j => state.open.has(j));
  let best = null;
  for (const i of unknown) {
    const p = prob.get(i);
    const score = p - (touching(i) ? 1e-6 : 0) + tr() * 1e-9;
    if (!best || score < best.score) best = { cell: i, p, score };
  }
  const odds = unknown.filter(i => Math.abs(prob.get(i) - best.p) < 1e-9).length;
  return { kind: 'guess', cell: best.cell, chance: best.p, reason: { why: 'guess', ties: odds } };
}

// Open a square (and flood through zeros, like the original).
export function openCell(board, state, nums, i) {
  const rocks = new Set(board.rocks);
  const opened = [];
  const stack = [i];
  while (stack.length) {
    const x = stack.pop();
    if (state.open.has(x) || rocks.has(x) || state.flags.has(x)) continue;
    state.open.add(x); opened.push(x);
    if (nums[x] === 0) for (const j of neighbours(x, board.n)) stack.push(j);
  }
  return opened;
}

// Play a whole round with no animation. Returns the list of steps, so the
// page can replay them at its own pace, plus the result.
export function playRound(board, mineSet, tieSeed = 0) {
  const mines = new Set(mineSet);
  const nums = numbers(board, mines);
  const state = { open: new Set(), flags: new Set() };
  const steps = [];
  let taps = 0;
  const first = openCell(board, state, nums, board.pad);
  taps++;
  steps.push({ kind: 'land', cells: first });
  for (let guard = 0; guard < 500; guard++) {
    const mv = nextMove(board, state, nums, tieSeed + guard);
    if (!mv) { steps.push({ kind: 'cleared' }); return { steps, result: 'cleared', taps, nums, mines }; }
    if (mv.kind === 'flag') {
      for (const c of mv.cells) state.flags.add(c);
      steps.push({ kind: 'flag', cells: mv.cells, reason: mv.reason });
      continue;
    }
    if (mv.kind === 'open') {
      const opened = [];
      for (const c of mv.cells) { if (!state.open.has(c)) { opened.push(...openCell(board, state, nums, c)); taps++; } }
      steps.push({ kind: 'open', cells: opened, reason: mv.reason });
      continue;
    }
    taps++;
    if (mines.has(mv.cell)) {
      steps.push({ kind: 'guess', cell: mv.cell, chance: mv.chance, reason: mv.reason, boom: true });
      return { steps, result: 'boom', taps, nums, mines, at: mv.cell };
    }
    const opened = openCell(board, state, nums, mv.cell);
    steps.push({ kind: 'guess', cell: mv.cell, chance: mv.chance, reason: mv.reason, cells: opened });
  }
  return { steps, result: 'cleared', taps, nums, mines };
}

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

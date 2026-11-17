import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../docs/engine.js';

const layout = (board, seed) => {
  const r = E.rng(seed);
  const allowed = [...Array(board.n * board.n).keys()].filter(i => E.canPlace(board, i));
  const m = new Set();
  while (m.size < E.MINES) m.add(allowed[Math.floor(r() * allowed.length)]);
  return m;
};

test('the daily board is the same for everyone on the same day', () => {
  assert.deepEqual(E.makeBoard('daily:2026-11-17'), E.makeBoard('daily:2026-11-17'));
  assert.notDeepEqual(E.makeBoard('daily:2026-11-17'), E.makeBoard('daily:2026-11-18'));
});

test('no mines on the landing pad, next to it, or on rocks', () => {
  const b = E.makeBoard('t');
  for (const i of b.safe) assert.equal(E.canPlace(b, i), false);
  for (const i of b.rocks) assert.equal(E.canPlace(b, i), false);
});

test('the sweeper never steps on a mine it could have worked out', () => {
  for (let g = 0; g < 300; g++) {
    const b = E.makeBoard('day' + (g % 30));
    const m = layout(b, g + 1);
    const res = E.playRound(b, m, g);
    for (const s of res.steps) {
      if (s.kind === 'open') assert.ok(s.cells.every(c => !m.has(c)), 'a sure move hit a mine');
      if (s.kind === 'flag') assert.ok(s.cells.every(c => m.has(c)), 'flagged a safe square');
    }
    if (res.result === 'boom') assert.equal(res.steps.at(-1).kind, 'guess');
  }
});

test('a true fifty-fifty is reported as one', () => {
  // Two corner squares, one mine. Rocks hide the only squares that could
  // tell them apart, so the numbers can't help.
  const b = { n: 9, mines: 1, pad: 40, safe: [], rocks: [2, 11] };
  const state = { open: new Set(), flags: new Set() };
  const nums = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) if (![0, 1, 2, 11].includes(i)) state.open.add(i);
  nums[9] = 1; nums[10] = 1;
  const mv = E.nextMove(b, state, nums, 1);
  assert.equal(mv.kind, 'guess');
  assert.ok(Math.abs(mv.chance - 0.5) < 1e-9);
});

test('the same trap plays out the same way every time', () => {
  const b = E.makeBoard('daily:2026-11-17');
  const m = layout(b, 7);
  const a = E.playRound(b, m, 42), c = E.playRound(b, m, 42);
  assert.equal(a.result, c.result);
  assert.equal(a.taps, c.taps);
});

test('the trap meter matches what really happens', () => {
  let predicted = 0, actual = 0;
  for (let g = 0; g < 400; g++) {
    const b = E.makeBoard('meter' + (g % 20));
    const m = layout(b, g + 3);
    predicted += E.trapOdds(b, m).catchChance;
    if (E.playRound(b, m, E.hashStr(b.seed + g)).result === 'boom') actual++;
  }
  assert.ok(Math.abs(predicted - actual) < 12, `predicted ${predicted.toFixed(1)} vs actual ${actual}`);
});

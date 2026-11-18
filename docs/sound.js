// Every sound is made live in the browser: no audio files to fetch.
let ctx = null;
let on = true;
try { on = localStorage.getItem('ff-sound') !== 'off'; } catch { /* storage blocked */ }

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem('ff-sound', v ? 'on' : 'off'); } catch { /* fine */ }
}
function ac() {
  if (!on) return null;
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, at = 0, lp = 2000, hp = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = c.createGain(); g.gain.value = vol;
  let node = s.connect(f);
  if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; node = node.connect(h); }
  node.connect(g).connect(c.destination); s.start(t);
}

export const click = () => tone(1400, 0.04, { type: 'square', vol: 0.05 });
export const place = () => { tone(220, 0.12, { type: 'triangle', vol: 0.2, slide: 0.6 }); noise(0.05, { vol: 0.08, lp: 900 }); };
export const remove = () => tone(500, 0.08, { type: 'triangle', vol: 0.1, slide: 1.6 });
export const pop = (k = 0) => tone(520 + k * 40, 0.07, { type: 'sine', vol: 0.08, slide: 1.3 });
export const flag = () => { tone(330, 0.09, { type: 'square', vol: 0.06 }); tone(495, 0.12, { type: 'square', vol: 0.05, at: 0.07 }); };
export const think = () => tone(880, 0.05, { type: 'sine', vol: 0.04 });
export function drumroll(sec = 1.4) {
  for (let t = 0; t < sec; t += 0.045) noise(0.04, { vol: 0.05 + 0.1 * (t / sec), at: t, lp: 3000, hp: 300 });
}
export const boom = () => { noise(1.1, { vol: 0.55, lp: 700 }); tone(80, 0.9, { type: 'sine', vol: 0.45, slide: 0.4 }); };
export const phew = () => { tone(660, 0.12, { vol: 0.1 }); tone(880, 0.22, { vol: 0.1, at: 0.1 }); };
export const win = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.12, at: i * 0.09 }));
export const wake = () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.05, slide: 4 }); tone(880, 0.3, { vol: 0.06, at: 0.45 }); };
// A note that climbs with the trap meter.
export const meterTone = pct => { tone(300 + pct * 6, 0.12, { type: 'triangle', vol: 0.08 }); if (pct >= 100) tone(1200, 0.2, { type: 'triangle', vol: 0.06, at: 0.08 }); };

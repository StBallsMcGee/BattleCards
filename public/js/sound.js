/* Battle Cards — tiny synthesized sound effects (no audio files needed). */
(function () {
  'use strict';
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slide) {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  }

  function noise(dur, vol, hp) {
    const a = ac();
    if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 800;
    src.buffer = buf;
    g.gain.value = vol || 0.08;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }

  const SFX = {
    click: () => tone(660, 0.06, 'triangle', 0.04),
    play: () => { tone(320, 0.12, 'triangle', 0.06, 520); },
    draw: () => noise(0.08, 0.03, 2500),
    dice: () => { for (let i = 0; i < 4; i++) setTimeout(() => noise(0.03, 0.05, 1500), i * 55); },
    hit: () => { noise(0.15, 0.12, 300); tone(140, 0.18, 'sawtooth', 0.05, 60); },
    parry: () => tone(1200, 0.15, 'square', 0.03, 900),
    status: () => tone(220, 0.25, 'sine', 0.06, 330),
    favour: () => { tone(523, 0.12, 'triangle', 0.06); setTimeout(() => tone(784, 0.2, 'triangle', 0.06), 110); },
    defeat: () => tone(200, 0.5, 'sawtooth', 0.05, 50),
    turn: () => { tone(392, 0.12, 'triangle', 0.05); setTimeout(() => tone(523, 0.18, 'triangle', 0.05), 120); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.07), i * 140)),
    lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sine', 0.07), i * 180)),
    error: () => tone(160, 0.15, 'square', 0.04),
  };

  window.BCSound = {
    play(name) { if (enabled && SFX[name]) try { SFX[name](); } catch (e) { /* audio unavailable */ } },
    setEnabled(v) { enabled = v; },
  };
})();

// 実行: node tests/test.js
const assert = require("assert");
const N = require("../js/notes.js");
const P = require("../js/pitch.js");

// --- 音名変換 ---
assert.strictEqual(N.nameToMidi("A4"), 69);
assert.strictEqual(N.nameToMidi("C4"), 60);
assert.strictEqual(N.nameToMidi("Bb3"), 58);
assert.strictEqual(N.nameToMidi("F#3"), 54);
assert.strictEqual(N.nameToMidi("H4"), null);
assert.strictEqual(N.midiToName(60), "C4");
assert.strictEqual(N.midiToJp(69), "ラ4");
assert.ok(Math.abs(N.midiToFreq(69) - 440) < 1e-9);
assert.deepStrictEqual(N.freqToNote(440), { midi: 69, cents: 0 });
assert.strictEqual(N.freqToNote(N.midiToFreq(60) * Math.pow(2, 20 / 1200)).cents, 20);

// --- キー提案 ---
const C = N.nameToMidi;
// 収まる場合は移動なし
let r = N.recommendShift({ low: C("C3"), high: C("G4") }, { low: C("A2"), high: C("C5") });
assert.strictEqual(r.shift, 0); assert.ok(r.fits);
// 高すぎる曲 → 下げる
r = N.recommendShift({ low: C("E3"), high: C("B4") }, { low: C("A2"), high: C("G4") });
assert.ok(r.fits && r.shift < 0, "下げて収まるはず: " + JSON.stringify(r));
assert.strictEqual(r.shift, -4); // B4→G4 まで4半音
// 低すぎる曲 → 上げる
r = N.recommendShift({ low: C("A2"), high: C("D4") }, { low: C("C3"), high: C("G4") });
assert.strictEqual(r.shift, 3);
// 音域が広すぎて収まらない
r = N.recommendShift({ low: C("G2"), high: C("C5") }, { low: C("C3"), high: C("G4") });
assert.ok(!r.fits && (r.over + r.under) > 0);
// グループ: 2人
const g = N.recommendShiftGroup(
  { low: C("C3"), high: C("G4") },
  [{ low: C("C3"), high: C("G4") }, { low: C("E3"), high: C("B4") }]
);
assert.ok(g.total >= 0 && g.ngCount <= 1);
// スケール
assert.deepStrictEqual(N.buildScale(60), [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
assert.strictEqual(N.shiftLabel(0), "原曲キー");
assert.strictEqual(N.shiftLabel(2), "+2");
assert.strictEqual(N.shiftLabel(-3), "-3");

// --- 音程検出（合成した声に近い波形） ---
function synth(freq, sr, n) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = 0.4 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(4 * Math.PI * freq * t) + 0.1 * Math.sin(6 * Math.PI * freq * t);
  }
  return b;
}
for (const f of [110, 196, 262, 330, 440, 660, 880]) {
  const d = P.detectPitch(synth(f, 44100, 2048), 44100);
  assert.ok(d.freq, f + "Hz が検出できない");
  const cents = 1200 * Math.log2(d.freq / f);
  assert.ok(Math.abs(cents) < 15, f + "Hz のずれが大きい: " + cents.toFixed(1) + " cents");
}
// 無音・ノイズでは検出しない
assert.strictEqual(P.detectPitch(new Float32Array(2048), 44100).freq, null);
const noise = new Float32Array(2048).map(() => (Math.random() - 0.5) * 0.5);
const nd = P.detectPitch(noise, 44100);
assert.ok(nd.freq === null || nd.clarity < 0.9);

console.log("すべてのテストに合格しました");

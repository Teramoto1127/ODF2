/* 音名・周波数・キー提案の計算（ブラウザでもNodeでも動く） */
(function (root) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const JP = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];

  // MIDIノート番号 <-> 周波数 (A4 = 440Hz = MIDI 69)
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // MIDI番号 -> "C4" 形式
  function midiToName(m) {
    m = Math.round(m);
    return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }
  // MIDI番号 -> "ド4" 形式
  function midiToJp(m) {
    m = Math.round(m);
    return JP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }
  // "C4" / "c#4" / "Db4" -> MIDI番号（失敗時 null）
  function nameToMidi(s) {
    const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(String(s).trim());
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    let acc = 0;
    if (m[2] === "#" || m[2] === "♯") acc = 1;
    if (m[2] === "b" || m[2] === "♭") acc = -1;
    return (parseInt(m[3], 10) + 1) * 12 + base + acc;
  }
  // 周波数 -> {midi(丸め), cents(ずれ)}
  function freqToNote(f) {
    const exact = freqToMidi(f);
    const midi = Math.round(exact);
    return { midi: midi, cents: Math.round((exact - midi) * 100) };
  }

  /**
   * 曲の音域を、ユーザーの音域に収めるキー移動量を探す。
   * song/user: {low, high}（MIDI番号）。shift: 半音単位（-6〜+6）
   * 戻り値: {shift, over, under, fits}
   *  over  = 高すぎる半音数 / under = 低すぎる半音数（0なら収まっている）
   */
  function evaluateShift(song, user, shift) {
    const over = Math.max(0, song.high + shift - user.high);
    const under = Math.max(0, user.low - (song.low + shift));
    return { shift: shift, over: over, under: under, fits: over === 0 && under === 0 };
  }
  function recommendShift(song, user, maxShift) {
    maxShift = maxShift == null ? 6 : maxShift;
    let best = null;
    for (let s = -maxShift; s <= maxShift; s++) {
      const e = evaluateShift(song, user, s);
      const penalty = e.over + e.under;
      // はみ出しが少ない順 → キー移動が小さい順 → 上げより下げを優先しない（同じなら絶対値）
      if (
        !best ||
        penalty < best.penalty ||
        (penalty === best.penalty && Math.abs(s) < Math.abs(best.result.shift))
      ) {
        best = { penalty: penalty, result: e };
      }
    }
    return best.result;
  }

  /**
   * グループ用。members: [{low, high}...]
   * 全員のはみ出し合計が最小になるキー移動を返す。
   */
  function recommendShiftGroup(song, members, maxShift) {
    maxShift = maxShift == null ? 6 : maxShift;
    let best = null;
    for (let s = -maxShift; s <= maxShift; s++) {
      let total = 0, ngCount = 0;
      members.forEach(function (m) {
        const e = evaluateShift(song, m, s);
        const p = e.over + e.under;
        total += p;
        if (p > 0) ngCount++;
      });
      if (
        !best ||
        total < best.total ||
        (total === best.total && Math.abs(s) < Math.abs(best.shift))
      ) {
        best = { shift: s, total: total, ngCount: ngCount };
      }
    }
    return best;
  }

  function shiftLabel(s) { return s === 0 ? "原曲キー" : (s > 0 ? "+" + s : String(s)); }

  // 音域から、基準音を起点にしたメジャースケール（上り下り）のMIDI列を作る
  function buildScale(rootMidi) {
    const steps = [0, 2, 4, 5, 7, 9, 11, 12];
    const up = steps.map(function (x) { return rootMidi + x; });
    return up.concat(up.slice(0, -1).reverse());
  }

  const api = {
    NAMES: NAMES, JP: JP,
    freqToMidi: freqToMidi, midiToFreq: midiToFreq,
    midiToName: midiToName, midiToJp: midiToJp, nameToMidi: nameToMidi,
    freqToNote: freqToNote,
    evaluateShift: evaluateShift, recommendShift: recommendShift,
    recommendShiftGroup: recommendShiftGroup, shiftLabel: shiftLabel,
    buildScale: buildScale
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Notes = api;
})(typeof window !== "undefined" ? window : globalThis);

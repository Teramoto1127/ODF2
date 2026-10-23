/* マイク入力と音程（基本周波数）の検出 */
(function (root) {
  /**
   * 自己相関法による基本周波数の検出。
   * buf: Float32Array の波形、sampleRate: サンプリング周波数
   * 戻り値: {freq, clarity}。声でない/無音のときは freq = null
   */
  function detectPitch(buf, sampleRate) {
    const n = buf.length;

    // 音量が小さすぎるときは無音とみなす
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.01) return { freq: null, clarity: 0, rms: rms };

    // 歌声の想定範囲: 約65Hz(C2) 〜 1100Hz(C6)
    const minLag = Math.floor(sampleRate / 1100);
    const maxLag = Math.min(Math.floor(sampleRate / 65), n - 1);

    // 正規化した差分関数（YIN の考え方）
    const d = new Float32Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        const diff = buf[i] - buf[i + lag];
        sum += diff * diff;
      }
      d[lag] = sum;
    }
    const cmnd = new Float32Array(maxLag + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      running += d[lag];
      cmnd[lag] = running === 0 ? 1 : (d[lag] * lag) / running;
    }

    // しきい値を最初に下回る谷を探す
    const threshold = 0.15;
    let tau = -1;
    for (let lag = Math.max(2, minLag); lag <= maxLag; lag++) {
      if (cmnd[lag] < threshold) {
        while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
        tau = lag;
        break;
      }
    }
    if (tau === -1) return { freq: null, clarity: 0, rms: rms };

    // 放物線補間で精度を上げる
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1 <= maxLag ? tau + 1 : tau];
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? (a - c) / (2 * denom) : 0;
    const refined = tau + shift;

    return { freq: sampleRate / refined, clarity: 1 - cmnd[tau], rms: rms };
  }

  /**
   * マイクを開始する。onPitch({freq, midi, cents, clarity}|null) が約60fpsで呼ばれる。
   * 戻り値: {stop()}
   */
  async function startMic(onPitch) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("このブラウザはマイク入力に対応していません。（HTTPSまたはlocalhostで開いてください）");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    let running = true;
    let recent = []; // 直近の中央値でノイズを抑える
    function loop() {
      if (!running) return;
      analyser.getFloatTimeDomainData(buf);
      const r = detectPitch(buf, ctx.sampleRate);
      if (r.freq && r.clarity > 0.8) {
        recent.push(r.freq);
        if (recent.length > 3) recent.shift();
        const sorted = recent.slice().sort(function (x, y) { return x - y; });
        const f = sorted[Math.floor(sorted.length / 2)];
        const note = Notes.freqToNote(f);
        onPitch({ freq: f, midi: note.midi, cents: note.cents, exact: Notes.freqToMidi(f), clarity: r.clarity });
      } else {
        recent = [];
        onPitch(null);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return {
      stop: function () {
        running = false;
        stream.getTracks().forEach(function (t) { t.stop(); });
        ctx.close();
      }
    };
  }

  const api = { detectPitch: detectPitch, startMic: startMic };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Pitch = api;
})(typeof window !== "undefined" ? window : globalThis);

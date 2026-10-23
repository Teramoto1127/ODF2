/* カラオケ キーナビ - 画面の動き */
(function () {
  "use strict";
  var N = Notes;
  var $ = function (s) { return document.querySelector(s); };
  var NOTE_MIN = 36; // C2
  var NOTE_MAX = 84; // C6

  // ---------- 保存 ----------
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem("odf2." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem("odf2." + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ }
    }
  };

  var SAMPLE_SONGS = [
    { id: "s1", title: "サンプル曲A（低め）", artist: "架空", low: N.nameToMidi("A2"), high: N.nameToMidi("D4") },
    { id: "s2", title: "サンプル曲B（ふつう）", artist: "架空", low: N.nameToMidi("C3"), high: N.nameToMidi("G4") },
    { id: "s3", title: "サンプル曲C（高め）", artist: "架空", low: N.nameToMidi("E3"), high: N.nameToMidi("B4") },
    { id: "s4", title: "サンプル曲D（広い）", artist: "架空", low: N.nameToMidi("G2"), high: N.nameToMidi("C5") }
  ];

  var profile = store.get("profile", null);
  var songs = store.get("songs", null) || SAMPLE_SONGS;
  var members = store.get("members", []);
  var history = store.get("history", []);

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function noteText(m) { return N.midiToName(m) + "（" + N.midiToJp(m) + "）"; }
  function fillSelect(sel, value) {
    sel.textContent = "";
    for (var m = NOTE_MIN; m <= NOTE_MAX; m++) {
      var o = document.createElement("option");
      o.value = m; o.textContent = noteText(m);
      sel.appendChild(o);
    }
    sel.value = value;
  }
  function setMsg(node, text, isError) {
    node.textContent = text || "";
    node.classList.toggle("error", !!isError);
  }

  // ---------- マイク管理（同時に1つだけ） ----------
  var activeMic = null;
  async function openMic(handler) {
    await closeMic();
    activeMic = await Pitch.startMic(handler);
  }
  function closeMic() {
    if (activeMic) { activeMic.stop(); activeMic = null; }
    return Promise.resolve();
  }

  // ---------- タブ ----------
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".panel").forEach(function (p) {
        p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab);
      });
      stopDiag();
      stopPractice(false);
      if (btn.dataset.tab === "pick") renderPick();
      if (btn.dataset.tab === "diag") renderKeyCheck();
    });
  });

  // =====================================================
  // ① キー診断
  // =====================================================
  var diag = { low: null, high: null, cand: null, count: 0, on: false };
  var myLow = $("#myLow"), myHigh = $("#myHigh");
  fillSelect(myLow, profile ? profile.low : N.nameToMidi("C3"));
  fillSelect(myHigh, profile ? profile.high : N.nameToMidi("C4"));

  function stopDiag() {
    if (!diag.on) return;
    diag.on = false;
    closeMic();
    $("#diagMicBtn").textContent = "マイク開始";
    $("#diagMicBtn").classList.remove("recording");
    $("#diagNote").textContent = "—";
    $("#diagCents").textContent = "";
  }

  function onDiagPitch(p) {
    if (!p) {
      $("#diagNote").textContent = "—";
      $("#diagCents").textContent = "声を出してください";
      diag.cand = null; diag.count = 0;
      return;
    }
    $("#diagNote").textContent = noteText(p.midi);
    $("#diagCents").textContent = (p.cents > 0 ? "+" : "") + p.cents + " セント";
    if (p.midi < NOTE_MIN || p.midi > NOTE_MAX) return;
    if (p.midi === diag.cand) diag.count++; else { diag.cand = p.midi; diag.count = 1; }
    if (diag.count === 18) { // 約0.3秒キープで確定（60fps想定）
      if (diag.low === null || p.midi < diag.low) { diag.low = p.midi; myLow.value = p.midi; }
      if (diag.high === null || p.midi > diag.high) { diag.high = p.midi; myHigh.value = p.midi; }
      if (diag.low > Number(myHigh.value)) myHigh.value = diag.low;
      if (diag.high < Number(myLow.value)) myLow.value = diag.high;
      renderKeyCheck();
    }
  }

  $("#diagMicBtn").addEventListener("click", async function () {
    var btn = this;
    if (diag.on) { stopDiag(); return; }
    try {
      await openMic(onDiagPitch);
      diag.on = true;
      btn.textContent = "測定を止める";
      btn.classList.add("recording");
      setMsg($("#profileMsg"), "測定中…低い声→高い声の順に出してみましょう");
    } catch (e) {
      setMsg($("#profileMsg"), "マイクを使えませんでした: " + e.message, true);
    }
  });
  $("#diagResetBtn").addEventListener("click", function () {
    diag.low = null; diag.high = null; diag.cand = null; diag.count = 0;
    setMsg($("#profileMsg"), "測定結果をリセットしました。リストで手動調整もできます。");
  });
  $("#saveProfileBtn").addEventListener("click", function () {
    var lo = Number(myLow.value), hi = Number(myHigh.value);
    if (lo > hi) { setMsg($("#profileMsg"), "最低音が最高音より高くなっています。", true); return; }
    profile = { low: lo, high: hi };
    store.set("profile", profile);
    setMsg($("#profileMsg"), "保存しました: " + N.midiToName(lo) + " 〜 " + N.midiToName(hi) + "（" + (hi - lo) + "半音）");
    renderKeyCheck();
  });
  myLow.addEventListener("change", renderKeyCheck);
  myHigh.addEventListener("change", renderKeyCheck);

  // --- 曲に合うキー ---
  var keySong = $("#keySong"), songLow = $("#songLow"), songHigh = $("#songHigh");
  fillSelect(songLow, N.nameToMidi("C3"));
  fillSelect(songHigh, N.nameToMidi("G4"));

  function refreshKeySongOptions() {
    var cur = keySong.value;
    keySong.textContent = "";
    var manual = el("option", null, "手入力（下の音域を使う）");
    manual.value = "";
    keySong.appendChild(manual);
    songs.forEach(function (s) {
      var o = el("option", null, s.title + (s.artist ? " / " + s.artist : ""));
      o.value = s.id;
      keySong.appendChild(o);
    });
    keySong.value = cur;
    if (keySong.selectedIndex === -1) keySong.value = "";
  }
  keySong.addEventListener("change", function () {
    var s = songs.filter(function (x) { return x.id === keySong.value; })[0];
    if (s) { songLow.value = s.low; songHigh.value = s.high; }
    renderKeyCheck();
  });
  songLow.addEventListener("change", function () { keySong.value = ""; renderKeyCheck(); });
  songHigh.addEventListener("change", function () { keySong.value = ""; renderKeyCheck(); });

  function renderKeyCheck() {
    var box = $("#keyResult");
    var viz = $("#rangeViz");
    box.className = "result";
    box.textContent = "";
    viz.textContent = "";

    var user = { low: Number(myLow.value), high: Number(myHigh.value) };
    var song = { low: Number(songLow.value), high: Number(songHigh.value) };
    if (user.low > user.high || song.low > song.high) {
      box.textContent = "最低音は最高音以下になるように選んでください。";
      box.classList.add("warn");
      return;
    }
    var r = N.recommendShift(song, user, 6);
    var gap = r.over + r.under;
    if (gap === 0) {
      box.classList.add(r.shift === 0 ? "ok" : "ok");
      box.appendChild(el("div", "big-key", "おすすめ: " + N.shiftLabel(r.shift)));
      box.appendChild(el("div", null, r.shift === 0
        ? "原曲のキーのままで、あなたの音域に収まります。"
        : "キーを " + N.shiftLabel(r.shift) + " にすると、曲全体があなたの音域に収まります。"));
    } else {
      box.classList.add(gap <= 2 ? "warn" : "ng");
      box.appendChild(el("div", "big-key", "近いのは: " + N.shiftLabel(r.shift)));
      var parts = [];
      if (r.over) parts.push("高い方で" + r.over + "半音");
      if (r.under) parts.push("低い方で" + r.under + "半音");
      box.appendChild(el("div", null,
        "この曲は音域が広く、どのキーでも" + parts.join("・") + "はみ出します。" +
        "はみ出しをいちばん少なくできるキーを表示しています。裏声やオクターブ下で歌う方法も検討してみてください。"));
    }
    var shifted = { low: song.low + r.shift, high: song.high + r.shift };
    box.appendChild(el("div", "small",
      "キー変更後の曲の音域: " + N.midiToName(shifted.low) + " 〜 " + N.midiToName(shifted.high) +
      " ／ あなたの音域: " + N.midiToName(user.low) + " 〜 " + N.midiToName(user.high)));
    drawRangeViz(viz, user, shifted, gap === 0);
  }

  function drawRangeViz(root, user, song, ok) {
    var min = Math.min(NOTE_MIN + 7, user.low, song.low) - 2;
    var max = Math.max(NOTE_MAX - 22, user.high, song.high) + 2;
    var span = max - min;
    function bar(range, cls, label) {
      var wrap = el("div");
      wrap.appendChild(el("div", "lbl", label));
      var track = el("div", "track");
      var b = el("div", "bar " + cls, N.midiToName(range.low) + " 〜 " + N.midiToName(range.high));
      b.style.left = ((range.low - min) / span * 100) + "%";
      b.style.width = ((range.high - range.low + 1) / span * 100) + "%";
      track.appendChild(b);
      wrap.appendChild(track);
      return wrap;
    }
    root.appendChild(bar(user, "me", "あなたの音域"));
    root.appendChild(bar(song, ok ? "song-ok" : "song", "曲の音域（おすすめキー適用後）"));
  }

  // =====================================================
  // ② 選曲サポート
  // =====================================================
  fillSelect($("#mLow"), N.nameToMidi("C3"));
  fillSelect($("#mHigh"), N.nameToMidi("C4"));
  fillSelect($("#sLow"), N.nameToMidi("C3"));
  fillSelect($("#sHigh"), N.nameToMidi("G4"));

  function saveMembers() { store.set("members", members); }
  function saveSongs() { store.set("songs", songs); refreshKeySongOptions(); }

  $("#addMeBtn").addEventListener("click", function () {
    if (!profile) { alert("先に「① キー診断」で音域を保存してください。"); return; }
    members = members.filter(function (m) { return m.id !== "me"; });
    members.unshift({ id: "me", name: "自分", low: profile.low, high: profile.high, on: true });
    saveMembers(); renderPick();
  });
  $("#memberForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var lo = Number($("#mLow").value), hi = Number($("#mHigh").value);
    if (lo > hi) { alert("最低音が最高音より高くなっています。"); return; }
    members.push({ id: uid(), name: $("#mName").value.trim(), low: lo, high: hi, on: true });
    $("#mName").value = "";
    saveMembers(); renderPick();
  });
  $("#songForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var lo = Number($("#sLow").value), hi = Number($("#sHigh").value);
    if (lo > hi) { alert("曲の最低音が最高音より高くなっています。"); return; }
    songs.push({ id: uid(), title: $("#sTitle").value.trim(), artist: $("#sArtist").value.trim(), low: lo, high: hi });
    $("#sTitle").value = ""; $("#sArtist").value = "";
    saveSongs(); renderPick();
  });

  function renderPick() {
    // 歌う人
    var ml = $("#memberList");
    ml.textContent = "";
    if (!members.length) ml.appendChild(el("p", "hint", "まだ誰も追加されていません。「自分を追加」か、下のフォームから追加してください。"));
    members.forEach(function (m) {
      var item = el("div", "item");
      var label = el("label");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = m.on;
      cb.addEventListener("change", function () { m.on = cb.checked; saveMembers(); renderPick(); });
      var main = el("div", "main");
      main.appendChild(el("div", "title", m.name));
      main.appendChild(el("div", "sub", N.midiToName(m.low) + " 〜 " + N.midiToName(m.high)));
      label.appendChild(cb); label.appendChild(main);
      item.appendChild(label);
      var del = el("button", "icon-btn", "✕");
      del.title = "削除"; del.setAttribute("aria-label", m.name + "を削除");
      del.addEventListener("click", function () {
        members = members.filter(function (x) { return x.id !== m.id; });
        saveMembers(); renderPick();
      });
      item.appendChild(del);
      ml.appendChild(item);
    });

    // ランキング
    var active = members.filter(function (m) { return m.on; });
    var pr = $("#pickResult");
    pr.textContent = "";
    if (!active.length) {
      pr.appendChild(el("p", "hint", "歌う人にチェックを入れると、歌いやすい曲が表示されます。"));
    } else {
      var rows = songs.map(function (s) {
        var g = N.recommendShiftGroup(s, active, 6);
        var ng = active.filter(function (m) {
          var e = N.evaluateShift(s, m, g.shift);
          return e.over + e.under > 0;
        }).map(function (m) { return m.name; });
        return { song: s, g: g, ng: ng };
      });
      rows.sort(function (a, b) {
        return a.g.ngCount - b.g.ngCount || a.g.total - b.g.total ||
          Math.abs(a.g.shift) - Math.abs(b.g.shift);
      });
      if (!rows.length) pr.appendChild(el("p", "hint", "曲が登録されていません。"));
      rows.forEach(function (r) {
        var item = el("div", "item");
        var main = el("div", "main");
        main.appendChild(el("div", "title", r.song.title));
        var sub = N.midiToName(r.song.low) + " 〜 " + N.midiToName(r.song.high) +
          (r.song.artist ? " ／ " + r.song.artist : "");
        if (r.ng.length) sub += " ／ 厳しい人: " + r.ng.join("、");
        main.appendChild(el("div", "sub", sub));
        item.appendChild(main);
        var right = el("div", "row");
        right.appendChild(el("span", "badge key", "キー " + N.shiftLabel(r.g.shift)));
        if (r.g.ngCount === 0) right.appendChild(el("span", "badge ok", "全員OK"));
        else if (r.g.total <= 2 * active.length) right.appendChild(el("span", "badge warn", r.g.ngCount + "人が少し厳しい"));
        else right.appendChild(el("span", "badge ng", r.g.ngCount + "人が厳しい"));
        item.appendChild(right);
        pr.appendChild(item);
      });
    }

    // 曲リスト
    var sl = $("#songList");
    sl.textContent = "";
    songs.forEach(function (s) {
      var item = el("div", "item");
      var main = el("div", "main");
      main.appendChild(el("div", "title", s.title));
      main.appendChild(el("div", "sub", N.midiToName(s.low) + " 〜 " + N.midiToName(s.high) + (s.artist ? " ／ " + s.artist : "")));
      item.appendChild(main);
      var del = el("button", "icon-btn", "✕");
      del.title = "削除"; del.setAttribute("aria-label", s.title + "を削除");
      del.addEventListener("click", function () {
        songs = songs.filter(function (x) { return x.id !== s.id; });
        saveSongs(); renderPick();
      });
      item.appendChild(del);
      sl.appendChild(item);
    });
  }

  // =====================================================
  // ③ 音程練習
  // =====================================================
  var HOLD_MS = 400;
  var TOL_CENTS = 50;
  var TRACE_MS = 6000;
  var pr = { on: false, targets: [], idx: 0, hold: 0, last: 0, voiced: 0, good: 0, trace: [], mode: "scale", raf: 0 };
  var toneCtx = null;

  $("#prMode").addEventListener("change", function () {
    $("#customBox").classList.toggle("hidden", this.value !== "custom");
  });

  function playTone(midi) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!toneCtx) toneCtx = new Ctx();
    if (toneCtx.state === "suspended") toneCtx.resume();
    var osc = toneCtx.createOscillator();
    var g = toneCtx.createGain();
    var t = toneCtx.currentTime;
    osc.type = "sine";
    osc.frequency.value = N.midiToFreq(midi);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.8);
    osc.connect(g); g.connect(toneCtx.destination);
    osc.start(t); osc.stop(t + 0.85);
  }
  $("#prToneBtn").addEventListener("click", function () {
    var m = pr.targets.length ? pr.targets[Math.min(pr.idx, pr.targets.length - 1)] : N.nameToMidi("C4");
    playTone(m);
  });

  function buildTargets() {
    if ($("#prMode").value === "custom") {
      var tokens = $("#prCustom").value.trim().split(/[\s,、]+/).filter(Boolean);
      if (!tokens.length) throw new Error("音名を入力してください（例: C4 D4 E4）");
      return tokens.map(function (t) {
        var m = N.nameToMidi(t);
        if (m == null) throw new Error("「" + t + "」は音名として読めません（例: C4, F#3, Bb3）");
        return m;
      });
    }
    var low = profile ? profile.low : N.nameToMidi("C3");
    var high = profile ? profile.high : N.nameToMidi("C4");
    var scale = N.buildScale(low).filter(function (m) { return m <= high; });
    if (scale.length < 5) scale = N.buildScale(low).slice(0, 5); // 狭い音域でも最低限の練習
    return scale;
  }

  function renderChips() {
    var box = $("#prChips");
    box.textContent = "";
    pr.targets.forEach(function (m, i) {
      var cls = "chip" + (i < pr.idx ? " done" : i === pr.idx && pr.on ? " current" : "");
      box.appendChild(el("span", cls, N.midiToName(m)));
    });
  }

  $("#prStartBtn").addEventListener("click", async function () {
    setMsg($("#prMsg"), "");
    try { pr.targets = buildTargets(); } catch (e) { setMsg($("#prMsg"), e.message, true); return; }
    try {
      pr.idx = 0; pr.hold = 0; pr.voiced = 0; pr.good = 0; pr.trace = []; pr.last = performance.now();
      pr.mode = $("#prMode").value;
      await openMic(onPracticePitch);
      pr.on = true;
      $("#prStartBtn").disabled = true;
      $("#prStopBtn").disabled = false;
      $("#prTarget").textContent = N.midiToName(pr.targets[0]);
      if ($("#prAutoTone").checked) playTone(pr.targets[0]);
      renderChips();
      loopDraw();
    } catch (e) {
      setMsg($("#prMsg"), "マイクを使えませんでした: " + e.message, true);
    }
  });
  $("#prStopBtn").addEventListener("click", function () { stopPractice(true); });

  function onPracticePitch(p) {
    if (!pr.on) return;
    var now = performance.now();
    var dt = Math.min(100, now - pr.last);
    pr.last = now;
    var target = pr.targets[pr.idx];
    if (!p) {
      pr.hold = 0;
      $("#prNow").textContent = "—";
      $("#prDev").textContent = "—";
      $("#prDev").className = "big";
      return;
    }
    var dev = Math.round((p.exact - target) * 100);
    pr.voiced++;
    var ok = Math.abs(dev) <= TOL_CENTS;
    if (ok) { pr.good++; pr.hold += dt; } else { pr.hold = 0; }
    pr.trace.push({ t: now, m: p.exact, dev: dev });
    $("#prNow").textContent = N.midiToName(p.midi);
    var devEl = $("#prDev");
    devEl.textContent = (dev > 0 ? "+" : "") + dev;
    devEl.className = "big " + (Math.abs(dev) <= 25 ? "good" : Math.abs(dev) <= TOL_CENTS ? "mid" : "bad");
    $("#prHold").style.width = Math.min(100, pr.hold / HOLD_MS * 100) + "%";

    if (pr.hold >= HOLD_MS) {
      pr.idx++; pr.hold = 0;
      if (pr.idx >= pr.targets.length) { stopPractice(true, true); return; }
      $("#prTarget").textContent = N.midiToName(pr.targets[pr.idx]);
      if ($("#prAutoTone").checked) playTone(pr.targets[pr.idx]);
      renderChips();
    }
  }

  function stopPractice(save, completed) {
    if (!pr.on) return;
    pr.on = false;
    cancelAnimationFrame(pr.raf);
    closeMic();
    $("#prStartBtn").disabled = false;
    $("#prStopBtn").disabled = true;
    $("#prHold").style.width = "0";
    if (save && pr.voiced > 20) {
      var acc = Math.round(pr.good / pr.voiced * 100);
      history.push({
        date: new Date().toISOString(),
        mode: pr.mode,
        accuracy: acc,
        done: Math.min(pr.idx, pr.targets.length),
        total: pr.targets.length
      });
      history = history.slice(-50);
      store.set("history", history);
      setMsg($("#prMsg"), (completed ? "完走しました！ " : "終了しました。 ") + "音程の正確さ: " + acc + "%（目標音 " +
        Math.min(pr.idx, pr.targets.length) + "/" + pr.targets.length + " クリア）");
      renderHistory();
    } else if (save) {
      setMsg($("#prMsg"), "声がほとんど検出されなかったため、記録は保存しませんでした。");
    }
    renderChips();
  }

  // --- 描画 ---
  var canvas = $("#prCanvas");
  function loopDraw() {
    if (!pr.on) return;
    drawPractice();
    pr.raf = requestAnimationFrame(loopDraw);
  }
  function drawPractice() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pr.targets.length) return;

    var lo = Math.min.apply(null, pr.targets) - 3;
    var hi = Math.max.apply(null, pr.targets) + 3;
    function y(m) { return h - 14 - (m - lo) / (hi - lo) * (h - 28); }

    ctx.font = "11px sans-serif";
    ctx.textBaseline = "middle";
    var seen = {};
    pr.targets.forEach(function (m) {
      if (seen[m]) return; seen[m] = 1;
      var cur = m === pr.targets[pr.idx];
      ctx.strokeStyle = cur ? "rgba(124,108,255,.95)" : "rgba(255,255,255,.12)";
      ctx.lineWidth = cur ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(34, y(m)); ctx.lineTo(w, y(m)); ctx.stroke();
      ctx.fillStyle = cur ? "#cfc9ff" : "rgba(255,255,255,.45)";
      ctx.fillText(N.midiToName(m), 2, y(m));
    });
    // 許容ゾーン
    var tm = pr.targets[pr.idx];
    ctx.fillStyle = "rgba(61,220,151,.12)";
    ctx.fillRect(34, y(tm + 0.5), w - 34, y(tm - 0.5) - y(tm + 0.5));

    var now = performance.now();
    var prev = null;
    pr.trace = pr.trace.filter(function (p) { return now - p.t <= TRACE_MS; });
    pr.trace.forEach(function (p) {
      var x = 34 + (1 - (now - p.t) / TRACE_MS) * (w - 34);
      var yy = y(Math.max(lo, Math.min(hi, p.m)));
      var a = Math.abs(p.dev);
      var col = a <= 25 ? "#3ddc97" : a <= TOL_CENTS ? "#ffc247" : "#ff5d6c";
      if (prev && x - prev.x < 12) {
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(x, yy); ctx.stroke();
      }
      prev = { x: x, y: yy };
    });
  }

  // --- 記録 ---
  function renderHistory() {
    var box = $("#prHistory");
    box.textContent = "";
    if (!history.length) { box.appendChild(el("p", "hint", "まだ記録がありません。練習すると、ここに正確さが残ります。")); return; }
    history.slice(-10).reverse().forEach(function (h) {
      var item = el("div", "item");
      var d = new Date(h.date);
      var main = el("div", "main");
      main.appendChild(el("div", "title", (d.getMonth() + 1) + "/" + d.getDate() + " " +
        ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) +
        "　" + (h.mode === "custom" ? "自分のメロディ" : "スケール")));
      main.appendChild(el("div", "sub", "目標音 " + h.done + "/" + h.total + " クリア"));
      item.appendChild(main);
      var cls = h.accuracy >= 80 ? "ok" : h.accuracy >= 50 ? "warn" : "ng";
      item.appendChild(el("span", "badge " + cls, "正確さ " + h.accuracy + "%"));
      box.appendChild(item);
    });
  }
  $("#clearHistoryBtn").addEventListener("click", function () {
    if (!confirm("練習の記録をすべて削除しますか？")) return;
    history = []; store.set("history", history); renderHistory();
  });

  // --- CSV 一括登録 ---
  function showCsv(msg, isError, errors) {
    setMsg($("#csvMsg"), msg, isError);
    var ul = $("#csvErrors");
    ul.textContent = "";
    (errors || []).slice(0, 10).forEach(function (e) {
      ul.appendChild(el("li", null, (e.line ? e.line + "行目: " : "") + e.reason));
    });
    if (errors && errors.length > 10) ul.appendChild(el("li", null, "ほか " + (errors.length - 10) + " 件"));
  }

  function downloadText(name, text) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function sameSong(a, b) { return a.title === b.title && (a.artist || "") === (b.artist || ""); }

  function importCsvText(text) {
    var res = SongCSV.parseSongs(SongCSV.parseCSV(text), { min: NOTE_MIN, max: NOTE_MAX });
    if (!res.songs.length) {
      showCsv("取り込める曲がありませんでした。今の曲リストは変更していません。", true, res.errors);
      return;
    }
    if ($("#csvReplace").checked) {
      if (!confirm("今の曲リスト（" + songs.length + "曲）を空にして、CSVの" + res.songs.length + "曲に置き換えます。よろしいですか？")) {
        showCsv("取り込みをキャンセルしました。", false);
        return;
      }
      songs = [];
    }
    var added = 0, updated = 0;
    res.songs.forEach(function (s) {
      var found = songs.filter(function (x) { return sameSong(x, s); })[0];
      if (found) { found.low = s.low; found.high = s.high; updated++; }
      else { songs.push({ id: uid(), title: s.title, artist: s.artist, low: s.low, high: s.high }); added++; }
    });
    saveSongs();
    renderPick();
    var msg = added + "曲を追加";
    if (updated) msg += "、" + updated + "曲を更新";
    if (res.errors.length) msg += "（" + res.errors.length + "行は読み込めずスキップ）";
    showCsv(msg + "しました。", false, res.errors);
  }

  $("#csvFile").addEventListener("change", function () {
    var input = this, file = input.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showCsv("ファイルが大きすぎます（1MBまで）。", true);
      input.value = "";
      return;
    }
    var rd = new FileReader();
    rd.onload = function () {
      try { importCsvText(SongCSV.decodeBuffer(rd.result)); }
      catch (e) { showCsv("読み込み中にエラーが起きました: " + e.message, true); }
      input.value = "";
    };
    rd.onerror = function () { showCsv("ファイルを読み込めませんでした。", true); input.value = ""; };
    rd.readAsArrayBuffer(file);
  });
  $("#csvTemplateBtn").addEventListener("click", function () {
    downloadText("songs-template.csv", SongCSV.templateCSV());
  });
  $("#csvExportBtn").addEventListener("click", function () {
    if (!songs.length) { showCsv("保存する曲がありません。", true); return; }
    downloadText("songs.csv", SongCSV.toCSV(songs));
    showCsv(songs.length + "曲をCSVに保存しました。", false);
  });
  $("#removeSamplesBtn").addEventListener("click", function () {
    var before = songs.length;
    songs = songs.filter(function (s) { return !/^s[1-4]$/.test(s.id); });
    if (songs.length === before) { showCsv("サンプル曲は残っていません。", false); return; }
    saveSongs();
    renderPick();
    showCsv((before - songs.length) + "曲のサンプル曲を削除しました。", false);
  });

  // ---------- 初期表示 ----------
  refreshKeySongOptions();
  renderKeyCheck();
  renderPick();
  renderHistory();
  renderChips();
})();

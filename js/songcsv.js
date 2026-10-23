/* 曲リストのCSV読み込み・書き出し（ブラウザでもNodeでも動く）
 * 列の順番: 曲名, アーティスト, 最低音, 最高音
 */
(function (root) {
  var N = typeof module !== "undefined" && module.exports ? require("./notes.js") : root.Notes;

  var MAX_ROWS = 2000;

  // バイト列を文字列に。UTF-8を試し、だめならShift_JIS（ExcelのCSV）
  function decodeBuffer(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { /* 次へ */ }
    try { return new TextDecoder("shift_jis").decode(buf); } catch (e) { /* 次へ */ }
    return new TextDecoder("utf-8").decode(buf);
  }

  // CSV文字列 -> 行の配列（各行はセルの配列）。引用符・""・セル内改行・CRLFに対応
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"' && field === "") {
        inQ = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function norm(s) { return String(s == null ? "" : s).normalize("NFKC").trim(); }
  function isBlankRow(r) { return r.every(function (x) { return String(x).trim() === ""; }); }

  /**
   * rows -> {songs:[{title,artist,low,high}], errors:[{line,reason}], skippedHeader:boolean}
   * opts: {min, max}（受け付ける音の範囲。MIDI番号）
   */
  function parseSongs(rows, opts) {
    opts = opts || {};
    var min = opts.min != null ? opts.min : 0;
    var max = opts.max != null ? opts.max : 127;
    var songs = [], errors = [], skippedHeader = false;

    if (rows.length > MAX_ROWS + 1) {
      return { songs: [], errors: [{ line: 0, reason: "行数が多すぎます（" + MAX_ROWS + "行まで）" }], skippedHeader: false };
    }

    var start = 0;
    // 1行目が見出し（3・4列目が音名として読めない）なら飛ばす
    var first = rows.find(function (r) { return !isBlankRow(r); });
    if (first && N.nameToMidi(norm(first[2])) == null && N.nameToMidi(norm(first[3])) == null) {
      start = rows.indexOf(first) + 1;
      skippedHeader = true;
    }

    for (var i = start; i < rows.length; i++) {
      var r = rows[i];
      if (isBlankRow(r)) continue;
      var line = i + 1;
      var title = norm(r[0]).slice(0, 40);
      var artist = norm(r[1]).slice(0, 30);
      if (!title) { errors.push({ line: line, reason: "曲名が空です" }); continue; }
      var lowS = norm(r[2]), highS = norm(r[3]);
      var low = N.nameToMidi(lowS), high = N.nameToMidi(highS);
      if (low == null) { errors.push({ line: line, reason: "最低音「" + lowS + "」が音名として読めません（例: C3, F#3, Bb3）" }); continue; }
      if (high == null) { errors.push({ line: line, reason: "最高音「" + highS + "」が音名として読めません（例: G4）" }); continue; }
      if (low > high) { errors.push({ line: line, reason: "最低音が最高音より高くなっています" }); continue; }
      if (low < min || high > max) {
        errors.push({ line: line, reason: "音域が対応範囲（" + N.midiToName(min) + "〜" + N.midiToName(max) + "）を超えています" });
        continue;
      }
      songs.push({ title: title, artist: artist, low: low, high: high });
    }
    return { songs: songs, errors: errors, skippedHeader: skippedHeader };
  }

  function csvCell(s) {
    s = String(s == null ? "" : s);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // 曲の配列 -> CSV文字列（ExcelでUTF-8を正しく開けるようBOM付き）
  function toCSV(songs) {
    var lines = ["曲名,アーティスト,最低音,最高音"];
    songs.forEach(function (s) {
      lines.push([s.title, s.artist || "", N.midiToName(s.low), N.midiToName(s.high)].map(csvCell).join(","));
    });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  function templateCSV() {
    return toCSV([
      { title: "（例）曲名をここに", artist: "アーティスト名", low: N.nameToMidi("C3"), high: N.nameToMidi("G4") },
      { title: "（例）二つ目の曲", artist: "", low: N.nameToMidi("A2"), high: N.nameToMidi("E4") }
    ]);
  }

  var api = {
    decodeBuffer: decodeBuffer, parseCSV: parseCSV, parseSongs: parseSongs,
    toCSV: toCSV, templateCSV: templateCSV, MAX_ROWS: MAX_ROWS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SongCSV = api;
})(typeof window !== "undefined" ? window : globalThis);

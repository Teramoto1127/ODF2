// 実行: node tests/csv.test.js
const assert = require("assert");
const N = require("../js/notes.js");
const S = require("../js/songcsv.js");
const opts = { min: N.nameToMidi("C2"), max: N.nameToMidi("C6") };
const C = N.nameToMidi;

// --- parseCSV ---
assert.deepStrictEqual(S.parseCSV("a,b,c\r\n1,2,3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
assert.deepStrictEqual(S.parseCSV('"a,b","he said ""hi""",x'), [["a,b", 'he said "hi"', "x"]]);
assert.deepStrictEqual(S.parseCSV('"1行目\n2行目",y'), [["1行目\n2行目", "y"]]);
assert.deepStrictEqual(S.parseCSV("﻿x,y"), [["x", "y"]]); // BOM

// --- parseSongs: 見出しあり ---
let r = S.parseSongs(S.parseCSV("曲名,アーティスト,最低音,最高音\n曲A,歌手A,C3,G4\n曲B,,A2,E4\n"), opts);
assert.ok(r.skippedHeader);
assert.strictEqual(r.errors.length, 0);
assert.deepStrictEqual(r.songs, [
  { title: "曲A", artist: "歌手A", low: C("C3"), high: C("G4") },
  { title: "曲B", artist: "", low: C("A2"), high: C("E4") }
]);

// 見出しなし
r = S.parseSongs(S.parseCSV("曲A,歌手A,C3,G4"), opts);
assert.ok(!r.skippedHeader);
assert.strictEqual(r.songs.length, 1);

// 全角・♯♭・小文字・空行・曲名にカンマ
r = S.parseSongs(S.parseCSV('"曲,X",歌手,ｃ＃3,ｂ♭４\n\n  \n曲Y,歌手,Ｂｂ2,Ｇ4'), opts);
assert.strictEqual(r.errors.length, 0, JSON.stringify(r.errors));
assert.strictEqual(r.songs[0].title, "曲,X");
assert.strictEqual(r.songs[0].low, C("C#3"));
assert.strictEqual(r.songs[0].high, C("Bb4"));
assert.strictEqual(r.songs[1].low, C("Bb2"));

// エラー行は理由つきでスキップし、他の行は読む
r = S.parseSongs(S.parseCSV([
  "曲名,アーティスト,最低音,最高音",
  "良い曲,歌手,C3,G4",
  ",歌手,C3,G4",          // 曲名なし (3行目)
  "音名ミス,歌手,X3,G4",  // 4行目
  "逆,歌手,G4,C3",        // 5行目
  "範囲外,歌手,C1,G4",    // 6行目
  "列不足,歌手"           // 7行目
].join("\n")), opts);
assert.strictEqual(r.songs.length, 1);
assert.deepStrictEqual(r.errors.map(e => e.line), [3, 4, 5, 6, 7]);

// 見出しだけ・空
assert.strictEqual(S.parseSongs(S.parseCSV("曲名,アーティスト,最低音,最高音"), opts).songs.length, 0);
assert.strictEqual(S.parseSongs(S.parseCSV(""), opts).songs.length, 0);

// 行数の上限
const big = Array.from({ length: S.MAX_ROWS + 5 }, (_, i) => "曲" + i + ",,C3,G4").join("\n");
assert.strictEqual(S.parseSongs(S.parseCSV(big), opts).songs.length, 0);

// --- 書き出し→読み込みで元に戻る ---
const src = [
  { title: '引用符"入り,曲', artist: "歌手", low: C("D3"), high: C("A4") },
  { title: "ふつう", artist: "", low: C("C3"), high: C("C5") }
];
const csv = S.toCSV(src);
assert.ok(csv.startsWith("﻿"));
const back = S.parseSongs(S.parseCSV(csv), opts);
assert.deepStrictEqual(back.songs, src);

// テンプレートは読み込める
assert.strictEqual(S.parseSongs(S.parseCSV(S.templateCSV()), opts).songs.length, 2);

// --- 文字コード ---
const utf8 = Buffer.from("曲名,歌手\n", "utf8");
assert.strictEqual(S.decodeBuffer(utf8), "曲名,歌手\n");
const sjis = Buffer.from([0x8b, 0xc8, 0x96, 0xbc]); // 「曲名」のShift_JIS
let sjisOk = true;
try { new TextDecoder("shift_jis"); } catch (e) { sjisOk = false; }
if (sjisOk) assert.strictEqual(S.decodeBuffer(sjis), "曲名");
else console.log("（この環境はShift_JISデコード非対応のため、その部分は省略）");

console.log("CSVのテストに合格しました");

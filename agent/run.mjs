#!/usr/bin/env node
// MobiBard agent CLI — Node 18+ 만 있으면 동작한다(설치·네트워크 불필요).
// 사용: node run.mjs <command> [file] [--옵션 값 ...]   도움말: node run.mjs help
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function createContext() {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextDecoder, TextEncoder, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, ArrayBuffer, DataView, Math, JSON, Date, Map, Set, WeakMap, Promise, Symbol, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, RangeError,
    Intl, setTimeout, clearTimeout, atob: globalThis.atob, btoa: globalThis.btoa, Blob, URL, URLSearchParams, structuredClone,
    performance: globalThis.performance, queueMicrotask, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.document = { baseURI: "file:///agent/", currentScript: null, documentElement: { lang: "ko" }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} };
  ctx.navigator = { language: "ko", userAgent: "node" };
  ctx.location = { href: "file:///agent/", search: "", protocol: "file:" };
  vm.createContext(ctx);
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "lib", "manifest.json"), "utf8"));
  for (const rel of manifest) vm.runInContext(fs.readFileSync(path.join(here, "lib", rel), "utf8"), ctx, { filename: rel });
  vm.runInContext(fs.readFileSync(path.join(here, "api.js"), "utf8"), ctx, { filename: "api.js" });
  return ctx;
}

function parseArgs(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2); const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true; else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}
const num = v => (v === undefined || v === true ? undefined : Number(v));
const list = v => (typeof v === "string" ? v.split(",").map(s => s.trim()).filter(Boolean) : undefined);

const HELP = `MobiBard agent CLI
  node run.mjs selftest                     환경 점검(Node 버전, 모듈 로딩, 변환 왕복). 처음에 한 번 실행
  node run.mjs capabilities                 기능 목록(JSON)
  node run.mjs formats                      읽을 수 있는 파일 확장자
  node run.mjs inspect <파일>               파일 내용 보기(악기 그룹 id 포함)
  node run.mjs midi-to-mml <mid|기타악보> [--channels 3] [--main 3] [--trust instrument|balance|context]
        [--main-inst auto|piano|...] [--rows auto,cymbal,...] [--groups id1,id2] [--quantize 64|32]
        [--volume pop|jazz|ballad|bossa|rock|funk|classical] [--strength light|normal|strong] [--optimize]
  node run.mjs optimize-mml <mml|mmi>
  node run.mjs generate-volume <mml|mmi> [--volume pop] [--strength normal] [--overwrite]
  node run.mjs edit-mml <mml|mmi> --op transpose|set-volume|adjust-volume|simplify-volume|fade|simplify-tempo|trim-short-rests|add-leading-silence|split-pages
        [--args '{"delta":1}']
  node run.mjs analyze-mml <mml|mmi>
  node run.mjs mml-to-midi <mml|mmi> [--instruments piano,flute,...]
  node run.mjs convert-to-midi <악보파일>
공통: --out <폴더>(기본 ./out)  --mmi(MMI도 출력)  --print(MML을 stdout에 출력)  --json <요청.json>(요청 JSON 그대로 실행)
        --mmi-track <번호>(MMI 입력에서 쓸 트랙)
결과: stdout에 JSON({ok, report, files}) 한 개. 파일은 --out 폴더에 저장.`;

async function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  if ((!cmd && !flags.json) || cmd === "help" || flags.help) { console.log(HELP); return; }
  const ctx = createContext();
  const AI = ctx.MobibardAI;
  if (cmd === "selftest") {
    const checks = [{ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.versions.node }];
    try {
      const a = await AI.run({ capability: "mml-to-midi", files: [{ name: "t.mml", text: "MML@t120l8cdefgab>c,l4ceg;" }] });
      checks.push({ name: "mml-to-midi", ok: a.ok && a.outputs?.[0]?.encoding === "base64", detail: a.ok ? `${a.report.noteCount} notes` : a.error?.message });
      const midi = a.ok ? Buffer.from(a.outputs[0].data, "base64") : null;
      const b = midi && await AI.run({ capability: "midi-to-mml", files: [{ name: "t.mid", bytes: new ctx.Uint8Array(midi) }], options: { channelCount: 2 } });
      checks.push({ name: "midi-to-mml", ok: !!(b && b.ok && /^MML@/.test(b.outputs[0].data)), detail: b?.ok ? "ok" : b?.error?.message });
    } catch (e) { checks.push({ name: "run", ok: false, detail: String(e.message || e) }); }
    const ok = checks.every(c => c.ok);
    console.log(JSON.stringify({ ok, checks, next: ok ? "사용 가능. node run.mjs help 로 명령을 확인하고 사용자의 파일을 변환하세요." : "일부 점검 실패. 사용자에게 상황을 알리고 AGENT_GUIDE.md 의 '사용할 수 없을 때'를 따르세요." }, null, 1));
    if (!ok) process.exit(1); return;
  }
  if (cmd === "capabilities") { console.log(fs.readFileSync(path.join(here, "capabilities.json"), "utf8")); return; }
  if (cmd === "formats") {
    console.log(JSON.stringify({ input: { midi: ["mid", "midi", "kar"], mml: ["mml", "txt"], mmi: ["mmi"], editorProject: ["mmlproj.json", "mmlproj"] }, output: { mml: ".mml", mmi: ".mmi", midi: ".mid" }, notSupported: "MusicXML/MuseScore/Guitar Pro/게임 시퀀스/오디오는 이 꾸러미(JS만)로 처리하지 않는다. 오디오는 MobiBard 사이트(simple/player)에서 MIDI로 전사한 뒤 MIDI를 넘긴다." }, null, 1)); return;
  }
  let request;
  if (flags.json) request = JSON.parse(fs.readFileSync(flags.json === true ? 0 : flags.json, "utf8"));
  else {
    const file = pos[1];
    if (!file && cmd !== "inspect") { console.error("파일 경로가 필요합니다. node run.mjs help"); process.exit(2); }
    if (!fs.existsSync(file)) { console.log(JSON.stringify({ ok: false, error: { code: "no-file", message: `파일을 찾을 수 없습니다: ${file}` } })); process.exit(1); }
    const o = {};
    if (cmd === "midi-to-mml") {
      Object.assign(o, { channelCount: num(flags.channels), mainCount: num(flags.main), trust: flags.trust, mainInst: flags["main-inst"], rows: list(flags.rows),
        selectedInstrumentGroups: list(flags.groups), quantizeDivision: num(flags.quantize), optimize: !!flags.optimize,
        cymbalDensity: flags["cymbal-density"], drumDensity: flags["drum-density"] });
      if (flags.volume) o.volume = { genre: flags.volume === true ? "pop" : flags.volume, strength: flags.strength || "normal" };
    } else if (cmd === "generate-volume") {
      Object.assign(o, { genre: flags.volume === true || !flags.volume ? "pop" : flags.volume, strength: flags.strength || "normal", overwriteExisting: !!flags.overwrite });
    } else if (cmd === "edit-mml") {
      o.op = flags.op; o.args = flags.args ? JSON.parse(flags.args) : {};
    } else if (cmd === "mml-to-midi") o.instruments = list(flags.instruments);
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    request = { capability: cmd, options: o, files: [{ name: path.basename(file), bytes: new Uint8Array(fs.readFileSync(file)) }],
      outputs: flags.mmi ? ["mml", "mmi"] : undefined };
    if (flags["mmi-track"] !== undefined) request.mmiTrack = Number(flags["mmi-track"]);
  }
  if (request.files) for (const f of request.files) if (f.path && !f.bytes) { f.name = f.name || path.basename(f.path); f.bytes = new Uint8Array(fs.readFileSync(f.path)); delete f.path; }
  if (request.files) for (const f of request.files) if (f.bytes) f.bytes = new ctx.Uint8Array(f.bytes);
  const res = await AI.run(request);
  const outDir = path.resolve(flags.out && flags.out !== true ? flags.out : "out");
  const files = [];
  if (res.ok && res.outputs?.length) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const out of res.outputs) {
      const p = path.join(outDir, out.name.replace(/[\\/:*?"<>|]/g, "_"));
      fs.writeFileSync(p, out.encoding === "base64" ? Buffer.from(out.data, "base64") : out.data, out.encoding === "base64" ? undefined : "utf8");
      files.push({ path: p, kind: out.kind, bytes: fs.statSync(p).size });
    }
  }
  const plain = JSON.parse(JSON.stringify({ ok: res.ok, capability: res.capability, report: res.report, steps: res.steps, error: res.error, files }));
  console.log(JSON.stringify(plain, null, 1));
  if (flags.print && res.ok) for (const out of res.outputs) if (out.kind === "mml") console.log("\n" + out.data);
  if (!res.ok) process.exit(1);
}
main().catch(e => { console.log(JSON.stringify({ ok: false, error: { code: "crash", message: String(e.stack || e) } })); process.exit(1); });

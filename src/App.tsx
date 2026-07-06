import React, { useState, useEffect, useRef, useMemo } from "react";
import { getJSON, setJSON, remove } from "./storage";
import {
  subscribeAuth, signInWithGoogle, signOutUser,
  pullUserState, pushAttempts, pushQuestionLog, subscribeUserState,
} from "./firebase";

/* ============================================================
   GMAT Focus — Full-Length Timed Simulator (v1, fixed-form)
   - 3 sections, 45:00 each, section-order choice
   - Bookmark + Review & Edit (max 3 answer changes per section)
   - All answer formats: PS, CR, RC, DS, Two-Part, Table Analysis,
     Graphics Interpretation, Multi-Source Reasoning
   - DI on-screen calculator
   - Estimated score band + timing analytics + error log by topic
   NOTE: items are original and UNCALIBRATED; score is an estimate,
   not a measurement. Difficulty is a fixed mix (not adaptive).
   ============================================================ */

const CSS = `
:root{
  --bg:#FBFBF9; --surface:#FFFFFF; --ink:#1C1C1A; --muted:#6B6B66;
  --line:#E4E3DD; --accent:#155E63; --accent-soft:#E3EFEF;
  --warn:#B4541E; --good:#2E7D55; --bad:#B23B3B; --flag:#C9A227;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
*{box-sizing:border-box}
.gx-root{font-family:var(--sans);color:var(--ink);background:var(--bg);min-height:100%;line-height:1.5;-webkit-font-smoothing:antialiased}
.gx-wrap{max-width:820px;margin:0 auto;padding:0 16px 40px}
.gx-h1{font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 6px}
.gx-lead{color:var(--muted);font-size:15px;margin:0 0 20px}
.gx-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px}
.gx-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent);margin:0 0 4px}
.gx-btn{font-family:var(--sans);font-size:15px;font-weight:600;border-radius:10px;padding:11px 16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;transition:background .12s,border-color .12s}
.gx-btn:hover{background:#F4F3EE}
.gx-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gx-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.gx-btn.primary:hover{background:#0F4F53}
.gx-btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}
.gx-btn:disabled{opacity:.45;cursor:not-allowed}
.gx-topbar{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--line)}
.gx-topin{max-width:820px;margin:0 auto;display:flex;align-items:center;gap:12px;padding:10px 16px}
.gx-sect{font-weight:700;font-size:14px}
.gx-count{font-family:var(--mono);font-size:12px;color:var(--muted)}
.gx-clock{margin-left:auto;font-family:var(--mono);font-size:18px;font-weight:600;letter-spacing:0.04em;padding:4px 10px;border-radius:8px;background:#F1F0EB;color:var(--ink)}
.gx-clock.warn{background:#F6E7DC;color:var(--warn)}
.gx-iconbtn{border:1px solid var(--line);background:var(--surface);border-radius:8px;width:38px;height:34px;cursor:pointer;font-size:15px}
.gx-iconbtn.on{background:#FBF4D6;border-color:var(--flag)}
.gx-stem{font-size:16px;margin:14px 0 4px;white-space:pre-wrap}
.gx-passage{background:#FAF9F4;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:14px 16px;font-size:15px;white-space:pre-wrap;margin:6px 0 14px;max-height:46vh;overflow:auto}
.gx-prompt{font-size:16px;font-weight:600;margin:12px 0 10px;white-space:pre-wrap}
.gx-choice{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:11px 13px;margin:8px 0;cursor:pointer;background:var(--surface);font-size:15px}
.gx-choice:hover{background:#F7F6F1}
.gx-choice.sel{border-color:var(--accent);background:var(--accent-soft)}
.gx-choice .lab{font-family:var(--mono);font-weight:700;color:var(--accent);min-width:18px}
.gx-choice.correct{border-color:var(--good);background:#E8F3EC}
.gx-choice.wrong{border-color:var(--bad);background:#F6E9E9}
.gx-foot{display:flex;gap:10px;align-items:center;margin-top:18px}
.gx-foot .spacer{flex:1}
.gx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:8px;margin:14px 0}
.gx-cell{aspect-ratio:1;border:1px solid var(--line);border-radius:8px;background:var(--surface);font-family:var(--mono);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative}
.gx-cell.ans{background:var(--accent-soft);border-color:var(--accent)}
.gx-cell.flag::after{content:"";position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:50%;background:var(--flag)}
.gx-pill{display:inline-block;font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:999px;background:#F1F0EB;color:var(--muted);margin-right:6px}
.gx-tbl{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0}
.gx-tbl th,.gx-tbl td{border:1px solid var(--line);padding:7px 9px;text-align:left}
.gx-tbl th{background:#F4F3EE;cursor:pointer;user-select:none}
.gx-yn{display:flex;gap:8px}
.gx-yn button{flex:0 0 auto;min-width:52px}
.gx-sel{font-family:var(--sans);font-size:14px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:#fff}
.gx-stmt{border:1px solid var(--line);border-radius:8px;padding:11px 13px;margin:8px 0;font-size:15px}
.gx-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.gx-tab{font-size:13px;font-weight:600;padding:7px 12px;border-radius:8px 8px 0 0;border:1px solid var(--line);background:#F4F3EE;cursor:pointer}
.gx-tab.on{background:var(--surface);border-bottom-color:var(--surface);color:var(--accent)}
.gx-note{font-size:13px;color:var(--muted);margin-top:10px}
.gx-banner{background:#FBF4D6;border:1px solid var(--flag);border-radius:10px;padding:10px 13px;font-size:13px;margin:12px 0}
.gx-stat{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:15px}
.gx-stat b{font-family:var(--mono)}
.gx-bar{height:9px;border-radius:5px;background:#EDECE6;overflow:hidden;margin-top:5px}
.gx-bar>span{display:block;height:100%;background:var(--accent)}
.gx-calc{position:fixed;right:16px;bottom:16px;z-index:40;width:230px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:12px}
.gx-calc .disp{font-family:var(--mono);font-size:20px;text-align:right;padding:8px 10px;background:#F4F3EE;border-radius:8px;margin-bottom:8px;overflow:hidden}
.gx-calc .keys{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.gx-calc button{padding:11px 0;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:15px;cursor:pointer}
.gx-exp{background:#F4F7F7;border:1px solid var(--accent-soft);border-radius:8px;padding:11px 13px;font-size:14px;margin-top:10px}
@media (max-width:520px){.gx-clock{font-size:16px}.gx-h1{font-size:21px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/* ---------- utilities ---------- */
const SECTION_TIME = 45 * 60; // seconds
const SECTION_META = {
  Q:  { name: "Quantitative Reasoning", short: "Quant", count: 21 },
  V:  { name: "Verbal Reasoning",       short: "Verbal", count: 23 },
  DI: { name: "Data Insights",          short: "Data Insights", count: 20 },
};
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
const LETTERS = ["A", "B", "C", "D", "E"];

// what counts as "answered" for each item type
function isAnswered(item, r) {
  if (r == null) return false;
  switch (item.type) {
    case "TPA": return Array.isArray(r) && r[0] != null && r[1] != null;
    case "TA":
    case "YN": return Array.isArray(r) && r.length === item.statements.length && r.every((x) => x != null);
    case "GI": return Array.isArray(r) && r.length === item.blanks.length && r.every((x) => x != null);
    default:   return r != null; // single index
  }
}
// is the response fully correct (all-or-nothing for multi-part)
function isCorrect(item, r) {
  if (!isAnswered(item, r)) return false;
  switch (item.type) {
    case "TPA": return r[0] === item.answer[0] && r[1] === item.answer[1];
    case "TA":
    case "YN": return item.statements.every((s, i) => r[i] === s.answer);
    case "GI": return item.blanks.every((b, i) => r[i] === b.answer);
    default:   return r === item.answer;
  }
}

/* ============================================================
   QUESTION BANK
   Each section is an ordered array. RC questions carry their
   passage; MSR carry their sources. Filled in batches.
   ============================================================ */

import QUANT from "./data/quant.json";
import RC_PASSAGES from "./data/rc.json";
import CR from "./data/cr.json";
import MSR_SOURCES from "./data/msr.json";
import DI from "./data/di.json";

/* Flatten the Verbal pool: each RC question becomes an independent item
   carrying its own passage, alongside all CR items. */
function verbalPool() {
  const rcQs = [];
  RC_PASSAGES.forEach((p) => {
    p.questions.forEach((q) =>
      rcQs.push({ ...q, section:"V", type:"RC", passage:p.text, passageTitle:p.title, diff:q.diff || p.diff })
    );
  });
  const crArr = CR.map((c) => ({ ...c, section:"V", type:"CR" }));
  return [...rcQs, ...crArr];
}

function buildPools() {
  return {
    Q: QUANT.map((q) => ({ ...q })),
    V: verbalPool(),
    DI: DI.map((d) => ({ ...d, section:"DI" })),
  };
}

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

/* Draw `count` items with soft difficulty quotas; fill any shortfall from the rest. */
function sampleSection(pool, count, quotas) {
  const byDiff = { easy: [], medium: [], hard: [] };
  pool.forEach((it) => { (byDiff[it.diff] || byDiff.medium).push(it); });
  Object.keys(byDiff).forEach((k) => { byDiff[k] = shuffle(byDiff[k]); });
  const picked = [], used = new Set();
  ["easy", "medium", "hard"].forEach((band) => {
    let need = quotas[band] || 0;
    while (need-- > 0 && byDiff[band].length) { const it = byDiff[band].pop(); picked.push(it); used.add(it.id); }
  });
  const rest = shuffle(pool.filter((it) => !used.has(it.id)));
  while (picked.length < count && rest.length) { const it = rest.pop(); picked.push(it); used.add(it.id); }
  return shuffle(picked).slice(0, count);
}

/* Deepseek-authored items are Daily Practice only — never drawn into a Full Test form. */
const isDeepseek = (it) => typeof it.creator === "string" && it.creator.startsWith("Deepseek");
const excludeDeepseek = (pool) => pool.filter((it) => !isDeepseek(it));

/* Fixed-form build: a fresh difficulty-balanced form drawn each attempt. */
function buildBank() {
  const pools = buildPools();
  return {
    Q: sampleSection(excludeDeepseek(pools.Q), SECTION_META.Q.count, { easy: 4, medium: 10, hard: 7 }),
    V: sampleSection(excludeDeepseek(pools.V), SECTION_META.V.count, { easy: 5, medium: 11, hard: 7 }),
    DI: sampleSection(excludeDeepseek(pools.DI), SECTION_META.DI.count, { easy: 5, medium: 9, hard: 6 }),
  };
}

/* ---------- scoring & analytics ----------
   Rasch/1PL-style ability estimate (MAP) with a logistic ability→score map
   that asymptotes below 90, so acing an easy form yields a high but bounded,
   wide-banded ESTIMATE rather than a confident ceiling. Items are uncalibrated,
   so this remains an estimate, not a measurement. */
const IRT_B = { easy: -1.0, medium: 0.3, hard: 1.7 };
const IRT_PVAR = 1.44, IRT_K = 1.436, IRT_TH0 = 0.19, IRT_SLOPE0 = 30 / (4 * 1.436);
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
function irtFit(items) { // items: [{ band, correct }]
  let best = -Infinity, bth = 0;
  for (let th = -3.5; th <= 3.5001; th += 0.05) {
    let ll = -(th * th) / (2 * IRT_PVAR);
    for (const it of items) {
      let p = sigmoid(th - (IRT_B[it.band] ?? 0.3));
      p = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
      ll += it.correct ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > best) { best = ll; bth = th; }
  }
  let info = 1 / IRT_PVAR;
  for (const it of items) { const p = sigmoid(bth - (IRT_B[it.band] ?? 0.3)); info += p * (1 - p); }
  const seTheta = 1 / Math.sqrt(info);
  const S = Math.round(60 + 30 * sigmoid((bth - IRT_TH0) / IRT_K));
  return { S: Math.min(90, Math.max(60, S)), seS: IRT_SLOPE0 * seTheta, theta: bth };
}
const snapScore = (x) => Math.min(805, Math.max(205, Math.round((x - 5) / 10) * 10 + 5));
function totalFromSections(secScores) { // [{ S, seS }]
  const Ssum = secScores.reduce((a, s) => a + (s.S - 60), 0);
  const T = 205 + 6.67 * Ssum;
  const seT = 6.67 * Math.sqrt(secScores.reduce((a, s) => a + s.seS * s.seS, 0));
  return { mid: snapScore(T), lo: snapScore(T - seT), hi: snapScore(T + seT) };
}

/* ---------- on-screen calculator (DI only) ---------- */
function Calculator({ onClose }) {
  const [disp, setDisp] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const num = (d) => { setDisp(fresh || disp === "0" ? String(d) : disp + d); setFresh(false); };
  const dot = () => { if (!disp.includes(".")) setDisp(disp + "."); setFresh(false); };
  const calc = (a, b, o) => o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : o === "÷" ? (b === 0 ? NaN : a / b) : b;
  const setOpFn = (o) => { const v = parseFloat(disp); if (acc != null && op && !fresh) { const r = calc(acc, v, op); setAcc(r); setDisp(String(+r.toFixed(8))); } else setAcc(v); setOp(o); setFresh(true); };
  const eq = () => { if (op == null || acc == null) return; const v = parseFloat(disp); const r = calc(acc, v, op); setDisp(Number.isNaN(r) ? "Error" : String(+r.toFixed(8))); setAcc(null); setOp(null); setFresh(true); };
  const clr = () => { setDisp("0"); setAcc(null); setOp(null); setFresh(true); };
  const K = (label, fn, cls) => <button onClick={fn} style={cls}>{label}</button>;
  return (
    <div className="gx-calc" role="dialog" aria-label="Calculator">
      <div style={{display:"flex",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:12,fontFamily:"var(--mono)",color:"var(--muted)"}}>CALCULATOR</span>
        <button onClick={onClose} className="gx-btn ghost" style={{marginLeft:"auto",padding:"2px 8px"}}>✕</button>
      </div>
      <div className="disp">{disp}</div>
      <div className="keys">
        {K("C", clr)}{K("÷", () => setOpFn("÷"))}{K("×", () => setOpFn("×"))}{K("−", () => setOpFn("−"))}
        {K("7", () => num(7))}{K("8", () => num(8))}{K("9", () => num(9))}{K("+", () => setOpFn("+"))}
        {K("4", () => num(4))}{K("5", () => num(5))}{K("6", () => num(6))}{K("=", eq)}
        {K("1", () => num(1))}{K("2", () => num(2))}{K("3", () => num(3))}{K(".", dot)}
        {K("0", () => num(0))}
      </div>
    </div>
  );
}

/* ---------- format renderers ---------- */
const DS_CHOICES = [
  "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.",
  "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.",
  "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.",
  "EACH statement ALONE is sufficient.",
  "Statements (1) and (2) TOGETHER are NOT sufficient.",
];
function ChoiceRow({ label, text, state, onClick }) {
  let cls = "gx-choice" + (state === "sel" ? " sel" : state === "correct" ? " correct" : state === "wrong" ? " wrong" : "");
  return (
    <div className={cls} role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}>
      <span className="lab">{label}</span><span>{text}</span>
    </div>
  );
}
function Choices({ choices, value, answer, onChange, review }) {
  return choices.map((c, i) => {
    let st = null;
    if (review) st = i === answer ? "correct" : i === value ? "wrong" : null;
    else if (value === i) st = "sel";
    return <ChoiceRow key={i} label={LETTERS[i]} text={c} state={st} onClick={review ? undefined : () => onChange(i)} />;
  });
}
function SourceTabs({ sources }) {
  const [t, setT] = useState(0);
  return (
    <div>
      <div className="gx-tabs">
        {sources.map((s, i) => (
          <button key={i} className={"gx-tab" + (i === t ? " on" : "")} onClick={() => setT(i)}>{s.tab}</button>
        ))}
      </div>
      <div className="gx-passage">{sources[t].text}</div>
    </div>
  );
}
function BarChart({ chart }) {
  const { labels, values, yLabel } = chart;
  const W = Math.max(300, labels.length * 72), H = 210, pad = 28, bw = 38;
  const max = Math.max(...values) * 1.12 || 1;
  const slot = (W - pad - 12) / labels.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 540, height: "auto", margin: "8px 0" }} role="img" aria-label={yLabel}>
      <text x={pad} y={13} fontSize="11" fill="#777">{yLabel}</text>
      <line x1={pad} y1={H - pad} x2={W - 6} y2={H - pad} stroke="#ccc" />
      {values.map((val, i) => {
        const h = (val / max) * (H - 2 * pad);
        const x = pad + 8 + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={H - pad - h} width={bw} height={h} fill="#155E63" rx="3" />
            <text x={x + bw / 2} y={H - pad + 14} fontSize="10" textAnchor="middle" fill="#555">{labels[i]}</text>
            <text x={x + bw / 2} y={H - pad - h - 4} fontSize="10" textAnchor="middle" fill="#333">{val}</text>
          </g>
        );
      })}
    </svg>
  );
}
function YesNoStatements({ statements, value, onChange, review }) {
  const v = value || statements.map(() => null);
  const set = (i, ans) => { const nv = [...v]; nv[i] = ans; onChange(nv); };
  return statements.map((s, i) => (
    <div key={i} className="gx-stmt">
      <div style={{ marginBottom: 8 }}>{s.text}</div>
      <div className="gx-yn">
        {["Yes", "No"].map((opt) => {
          const picked = v[i] === opt;
          const showCorrect = review && opt === s.answer;
          const cls = "gx-btn" + (picked && !review ? " primary" : "");
          return (
            <button key={opt} className={cls} disabled={review} onClick={() => set(i, opt)}
              style={showCorrect ? { borderColor: "var(--good)", background: "#E8F3EC", color: "var(--good)", fontWeight: 700 } : {}}>
              {opt}{picked && review && opt !== s.answer ? " ✗" : ""}
            </button>
          );
        })}
      </div>
    </div>
  ));
}
function DataTable({ table }) {
  const [sortCol, setSortCol] = useState(null);
  const [asc, setAsc] = useState(true);
  let rows = table.rows;
  if (sortCol != null) {
    rows = [...rows].sort((a, b) => {
      const x = a[sortCol], y = b[sortCol];
      const num = typeof x === "number" && typeof y === "number";
      const r = num ? x - y : String(x).localeCompare(String(y));
      return asc ? r : -r;
    });
  }
  return (
    <table className="gx-tbl">
      <thead><tr>{table.cols.map((c, ci) => (
        <th key={ci} onClick={() => { if (sortCol === ci) setAsc(!asc); else { setSortCol(ci); setAsc(true); } }}>
          {c}{sortCol === ci ? (asc ? " ▲" : " ▼") : ""}
        </th>))}</tr></thead>
      <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody>
    </table>
  );
}
function TwoPart({ item, value, onChange, review }) {
  const v = value || [null, null];
  const set = (col, idx) => { const nv = [...v]; nv[col] = idx; onChange(nv); };
  return (
    <table className="gx-tbl">
      <thead><tr>{item.colLabels.map((l, i) => <th key={i} style={{ textAlign: "center" }}>{l}</th>)}<th>Option</th></tr></thead>
      <tbody>
        {item.options.map((opt, oi) => (
          <tr key={oi}>
            {item.colLabels.map((_, ci) => {
              const correctHere = review && item.answer[ci] === oi;
              return (
                <td key={ci} style={{ textAlign: "center", background: correctHere ? "#E8F3EC" : undefined }}>
                  <input type="radio" name={item.id + "-" + ci} checked={v[ci] === oi} disabled={review} onChange={() => set(ci, oi)} />
                </td>
              );
            })}
            <td>{opt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Graphics({ item, value, onChange, review }) {
  const v = value || item.blanks.map(() => null);
  const set = (i, idx) => { const nv = [...v]; nv[i] = idx; onChange(nv); };
  const parts = item.template.split(/(\{\d\})/);
  return (
    <div>
      <BarChart chart={item.chart} />
      <div style={{ fontSize: 16, lineHeight: 2 }}>
        {parts.map((p, i) => {
          const m = p.match(/^\{(\d)\}$/);
          if (m) {
            const bi = +m[1], b = item.blanks[bi];
            const wrong = review && v[bi] != null && v[bi] !== b.answer;
            return (
              <select key={i} className="gx-sel" value={v[bi] == null ? "" : v[bi]} disabled={review}
                onChange={(e) => set(bi, +e.target.value)}
                style={review ? { borderColor: wrong ? "var(--bad)" : "var(--good)" } : {}}>
                <option value="" disabled>— select —</option>
                {b.options.map((o, oi) => <option key={oi} value={oi}>{o}</option>)}
              </select>
            );
          }
          return <span key={i}>{p}</span>;
        })}
      </div>
      {review && <div className="gx-note">Correct: {item.blanks.map((b) => b.options[b.answer]).join("  ·  ")}</div>}
    </div>
  );
}
function QuestionView({ item, resp, setResp, review }) {
  const onChange = (v) => setResp(item.id, v);
  let body;
  if (item.type === "DS") {
    body = (
      <div>
        <div className="gx-stmt">(1)&nbsp; {item.s1}</div>
        <div className="gx-stmt">(2)&nbsp; {item.s2}</div>
        <div style={{ marginTop: 8 }}>
          <Choices choices={DS_CHOICES} value={resp} answer={item.answer} onChange={onChange} review={review} />
        </div>
      </div>
    );
  } else if (item.type === "TPA") {
    body = <TwoPart item={item} value={resp} onChange={onChange} review={review} />;
  } else if (item.type === "TA") {
    body = <div><DataTable table={item.table} /><YesNoStatements statements={item.statements} value={resp} onChange={onChange} review={review} /></div>;
  } else if (item.type === "YN") {
    body = <YesNoStatements statements={item.statements} value={resp} onChange={onChange} review={review} />;
  } else if (item.type === "GI") {
    body = <Graphics item={item} value={resp} onChange={onChange} review={review} />;
  } else {
    body = <Choices choices={item.choices} value={resp} answer={item.answer} onChange={onChange} review={review} />;
  }
  return (
    <div>
      {item.type === "RC" && item.passage && (
        <><div className="gx-eyebrow">Passage{item.passageTitle ? " · " + item.passageTitle : ""}</div><div className="gx-passage">{item.passage}</div></>
      )}
      {(item.type === "MSR" || item.type === "YN") && item.sources && <SourceTabs sources={item.sources} />}
      <div className="gx-prompt">{item.prompt}</div>
      {body}
      {review && item.exp && <div className="gx-exp"><b>Explanation.</b> {item.exp}</div>}
    </div>
  );
}

/* ---------- screens ---------- */
function AuthBar({ user, cloudStatus, onSignIn, onSignOut }) {
  const statusText = { local: "Local only", connecting: "Connecting…", synced: "Cloud synced", error: "Sync error" }[cloudStatus] || "Local only";
  return (
    <div className="gx-card" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, margin: "16px 0" }}>
      {user ? (
        <>
          {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />}
          <span style={{ flex: "1 1 160px", fontSize: 14 }}>{user.displayName || user.email}<br /><span className="gx-note">{statusText}</span></span>
          <button className="gx-btn" onClick={onSignOut}>Sign out</button>
        </>
      ) : (
        <>
          <span style={{ flex: "1 1 160px", fontSize: 14 }}>Sync your history across devices<br /><span className="gx-note">{statusText}</span></span>
          <button className="gx-btn primary" onClick={onSignIn}>Sign in with Google</button>
        </>
      )}
    </div>
  );
}

function Intro({ onStart, onPractice, onHistory, attempts, user, cloudStatus, onSignIn, onSignOut }) {
  return (
    <div className="gx-wrap">
      <p className="gx-eyebrow" style={{ marginTop: 28 }}>Timed full-length</p>
      <h1 className="gx-h1">GMAT Focus — Practice Simulator</h1>
      <AuthBar user={user} cloudStatus={cloudStatus} onSignIn={onSignIn} onSignOut={onSignOut} />
      <p className="gx-lead">Three sections, 45 minutes each, 64 questions total. You choose the order. Bookmark questions and change up to three answers per section in Review &amp; Edit, exactly as on the real exam.</p>
      <div className="gx-card">
        <div className="gx-stat"><span>Quantitative Reasoning</span><b>21 Q · 45:00</b></div>
        <div className="gx-stat"><span>Verbal Reasoning</span><b>23 Q · 45:00</b></div>
        <div className="gx-stat" style={{ borderBottom: "none" }}><span>Data Insights</span><b>20 Q · 45:00</b></div>
      </div>
      <div className="gx-banner" style={{ marginTop: 16 }}>
        These are original, uncalibrated practice items. The final score is a rough <b>estimate</b>, not a measurement, and difficulty is a fixed mix (not adaptive). Use the timing analytics and error log as the real signal.
      </div>
      <button className="gx-btn primary" style={{ marginTop: 8, width: "100%" }} onClick={onStart}>Choose section order</button>
      <button className="gx-btn" style={{ marginTop: 8, width: "100%" }} onClick={onPractice}>Daily Practice — one question at a time</button>
      <button className="gx-btn" style={{ marginTop: 8, width: "100%" }} onClick={onHistory}>View history{attempts && attempts.length > 0 ? ` (${attempts.length})` : ""}</button>
    </div>
  );
}
function OrderPick({ onBegin }) {
  const [order, setOrder] = useState([]);
  const keys = ["Q", "V", "DI"];
  const add = (k) => { if (!order.includes(k)) setOrder([...order, k]); };
  return (
    <div className="gx-wrap">
      <p className="gx-eyebrow" style={{ marginTop: 28 }}>Step 2</p>
      <h1 className="gx-h1">Pick your section order</h1>
      <p className="gx-lead">Tap the sections in the order you want to take them.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {keys.map((k) => {
          const pos = order.indexOf(k);
          return (
            <button key={k} className={"gx-btn" + (pos >= 0 ? " primary" : "")} onClick={() => add(k)} disabled={pos >= 0}>
              {pos >= 0 ? `${pos + 1}. ` : ""}{SECTION_META[k].short}
            </button>
          );
        })}
      </div>
      <div className="gx-foot">
        <button className="gx-btn" onClick={() => setOrder([])} disabled={!order.length}>Reset</button>
        <div className="spacer" />
        <button className="gx-btn" onClick={() => onBegin(["Q", "V", "DI"])}>Use default order</button>
        <button className="gx-btn primary" onClick={() => onBegin(order)} disabled={order.length !== 3}>Start exam</button>
      </div>
    </div>
  );
}

/* Endless one-at-a-time practice, no timer. Draws from the unfiltered pool
   (including Deepseek-authored items — this mode is their only outlet). */
function PracticeMode({ onBack, onLog }) {
  const pools = useMemo(() => buildPools(), []);
  const [filter, setFilter] = useState("ALL");
  const combined = useMemo(() => {
    if (filter === "ALL") return [...pools.Q, ...pools.V, ...pools.DI];
    return pools[filter];
  }, [pools, filter]);

  const [item, setItem] = useState(null);
  const [resp, setRespState] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  function drawNext(pool = combined, avoidId = item?.id) {
    if (!pool.length) { setItem(null); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && pick.id === avoidId) {
      while (pick.id === avoidId) pick = pool[Math.floor(Math.random() * pool.length)];
    }
    setItem(pick); setRespState(null); setSubmitted(false);
  }

  useEffect(() => { drawNext(combined, null); /* eslint-disable-next-line */ }, [filter]);

  const setResp = (_id, v) => setRespState(v);

  function submit() {
    if (!item || submitted) return;
    setSubmitted(true);
    onLog({
      itemId: item.id, mode: "daily", section: item.section, topic: item.topic, diff: item.diff,
      chosenResponse: resp ?? null, correct: isCorrect(item, resp), answered: isAnswered(item, resp),
      timestamp: new Date().toISOString(),
    });
  }

  return (
    <div className="gx-wrap">
      <p className="gx-eyebrow" style={{ marginTop: 28 }}>Daily practice</p>
      <h1 className="gx-h1">One question at a time</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 16px" }}>
        {["ALL", "Q", "V", "DI"].map((k) => (
          <button key={k} className={"gx-btn" + (filter === k ? " primary" : "")} onClick={() => setFilter(k)}>
            {k === "ALL" ? "All sections" : SECTION_META[k].short}
          </button>
        ))}
      </div>

      {!item ? (
        <p className="gx-lead">No questions available for this filter.</p>
      ) : (
        <>
          <span className="gx-pill">{SECTION_META[item.section]?.short}</span>
          <span className="gx-pill">{item.topic}</span>
          <span className="gx-pill">{item.diff}</span>
          <QuestionView item={item} resp={resp} setResp={setResp} review={submitted} />
          <div className="gx-foot">
            <button className="gx-btn" onClick={onBack}>Back</button>
            <div className="spacer" />
            {!submitted
              ? <button className="gx-btn primary" onClick={submit} disabled={!isAnswered(item, resp)}>Submit</button>
              : <button className="gx-btn primary" onClick={() => drawNext()}>Next question</button>}
          </div>
        </>
      )}
    </div>
  );
}

function Results({ sections, onRestart, savedCount }) {
  const secScores = sections.map((s) => ({ S: s.result.score, seS: s.result.seS }));
  const tot = totalFromSections(secScores);
  const central = tot.mid; const band = [tot.lo, tot.hi];
  const allQ = sections.flatMap((s) => s.result.perQ);
  const wrongByTopic = {};
  allQ.forEach((q) => { if (!q.correct) wrongByTopic[q.topic] = (wrongByTopic[q.topic] || 0) + 1; });
  const topicRows = Object.entries(wrongByTopic).sort((a, b) => b[1] - a[1]);
  const slow = allQ.filter((q) => q.time > 150);
  const [openSec, setOpenSec] = useState(null);

  return (
    <div className="gx-wrap">
      <p className="gx-eyebrow" style={{ marginTop: 28 }}>Results · estimate only</p>
      <h1 className="gx-h1">Estimated {band[0]}–{band[1]}</h1>
      <p className="gx-lead">A wide estimate from uncalibrated items that currently run easier than the real exam, so the high end is especially uncertain. Treat the timing and error breakdown below as the more reliable signal.</p>

      <div className="gx-card">
        {sections.map((s) => {
          const r = s.result, acc = Math.round((r.correct / r.total) * 100), est = s.result.score;
          const mins = Math.floor(r.timeUsed / 60), secs = r.timeUsed % 60;
          return (
            <div key={s.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <b>{SECTION_META[s.key].short}</b>
                <span style={{ fontFamily: "var(--mono)" }}>{r.correct}/{r.total} · {acc}% · ~{est}</span>
              </div>
              <div className="gx-bar"><span style={{ width: acc + "%" }} /></div>
              <div className="gx-note">Time used {mins}m {String(secs).padStart(2, "0")}s of 45m · avg {(r.timeUsed / r.total).toFixed(0)}s/question</div>
            </div>
          );
        })}
      </div>

      <h2 className="gx-h1" style={{ fontSize: 18, marginTop: 22 }}>Timing</h2>
      <div className="gx-card">
        <div className="gx-stat"><span>Questions over 2.5 min</span><b>{slow.length}</b></div>
        <div className="gx-stat" style={{ borderBottom: "none" }}><span>Accuracy on those</span><b>{slow.length ? Math.round(slow.filter((q) => q.correct).length / slow.length * 100) + "%" : "—"}</b></div>
        {slow.length > 0 && <div className="gx-note">Slow items: {slow.map((q) => q.id).join(", ")}</div>}
      </div>

      <h2 className="gx-h1" style={{ fontSize: 18, marginTop: 22 }}>Error log by type</h2>
      <div className="gx-card">
        {topicRows.length === 0 ? <p style={{ margin: 0 }}>No misses — clean run.</p> :
          topicRows.map(([t, n]) => (
            <div key={t} className="gx-stat"><span>{t}</span><b>{n} miss{n > 1 ? "es" : ""}</b></div>
          ))}
      </div>

      <h2 className="gx-h1" style={{ fontSize: 18, marginTop: 22 }}>Review answers</h2>
      {sections.map((s) => (
        <div key={s.key} style={{ marginBottom: 10 }}>
          <button className="gx-btn" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenSec(openSec === s.key ? null : s.key)}>
            {openSec === s.key ? "▾" : "▸"} {SECTION_META[s.key].name} — {s.result.correct}/{s.result.total}
          </button>
          {openSec === s.key && (
            <div style={{ marginTop: 8 }}>
              {s.items.map((it, i) => {
                const q = s.result.perQ.find((x) => x.id === it.id);
                if (!q) return null;
                return (
                  <div key={it.id} className="gx-card" style={{ marginBottom: 10, borderLeft: `3px solid ${q.correct ? "var(--good)" : q.answered ? "var(--bad)" : "var(--muted)"}` }}>
                    <div className="gx-eyebrow">{SECTION_META[s.key].short} · Q{i + 1} · {q.correct ? "Correct" : q.answered ? "Incorrect" : "Skipped"}</div>
                    <QuestionView item={it} resp={s.responses[it.id]} setResp={() => {}} review={true} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className="gx-note" style={{ marginTop: 8 }}>{savedCount != null ? `Saved. ${savedCount} attempt${savedCount === 1 ? "" : "s"} stored on this device.` : ""}</div>
      <button className="gx-btn primary" style={{ marginTop: 12, width: "100%" }} onClick={onRestart}>New attempt</button>
    </div>
  );
}

/* Catches render errors so a crash shows a recovery screen and preserves saved data. */
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.hasError) this.setState({ hasError: false }); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="gx-wrap">
          <p className="gx-eyebrow" style={{ marginTop: 28 }}>Something went wrong</p>
          <h1 className="gx-h1">This screen hit an error</h1>
          <p className="gx-lead">Your saved attempts have not been lost. You can view your history or start a new test.</p>
          <div className="gx-foot">
            <button className="gx-btn" onClick={this.props.onHistory}>View history</button>
            <button className="gx-btn primary" onClick={this.props.onHome}>Back to start</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function QuestionLogEntry({ entry, item, onUpdateNote }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(entry.note || "");
  const when = new Date(entry.timestamp).toLocaleString();
  return (
    <div className="gx-card" style={{ marginBottom: 10, borderLeft: `3px solid ${entry.correct ? "var(--good)" : entry.answered ? "var(--bad)" : "var(--muted)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <span>
          <span className="gx-pill">{entry.mode === "full" ? "Full Test" : "Daily Practice"}</span>
          <span className="gx-pill">{SECTION_META[entry.section]?.short}</span>
          <span className="gx-pill">{entry.topic}</span>
        </span>
        <span className="gx-note">{when}</span>
      </div>
      <div className="gx-note" style={{ marginTop: 4 }}>{entry.correct ? "Correct" : entry.answered ? "Incorrect" : "Skipped"}</div>
      <button className="gx-btn ghost" style={{ padding: "4px 0", marginTop: 6 }} onClick={() => setOpen(!open)}>
        {open ? "▾ hide question" : "▸ show question"}
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          {item ? (
            <QuestionView item={item} resp={entry.chosenResponse} setResp={() => {}} review={true} />
          ) : (
            <p className="gx-note">Question no longer in the bank.</p>
          )}
          <label className="gx-note" style={{ display: "block", marginTop: 10, marginBottom: 4 }}>Your note</label>
          <textarea
            className="gx-sel" style={{ width: "100%", minHeight: 60, fontFamily: "var(--sans)" }}
            value={note} onChange={(e) => setNote(e.target.value)}
            onBlur={() => onUpdateNote(entry.id, note)}
            placeholder="Why did I get this wrong? What to remember next time…"
          />
        </div>
      )}
    </div>
  );
}

function History({ attempts, questionLog, onBack, onClear, onClearLog, onUpdateNote }) {
  const [open, setOpen] = useState(null);
  const list = [...attempts].reverse();

  const bank = useMemo(() => {
    const pools = buildPools();
    const map = new Map();
    [...pools.Q, ...pools.V, ...pools.DI].forEach((it) => map.set(it.id, it));
    return map;
  }, []);

  const [modeFilter, setModeFilter] = useState("ALL");
  const [correctFilter, setCorrectFilter] = useState("ALL");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const logList = [...(questionLog || [])].reverse().filter((e) => {
    if (modeFilter !== "ALL" && e.mode !== modeFilter) return false;
    if (correctFilter === "WRONG" && e.correct) return false;
    if (sectionFilter !== "ALL" && e.section !== sectionFilter) return false;
    return true;
  });

  return (
    <div className="gx-wrap">
      <p className="gx-eyebrow" style={{ marginTop: 28 }}>Saved attempts</p>
      <h1 className="gx-h1">History</h1>
      {list.length === 0 ? (
        <p className="gx-lead">No saved attempts yet. Finish a test and it will be stored here.</p>
      ) : (
        list.map((a) => {
          const when = new Date(a.date).toLocaleString();
          const topics = Object.entries(a.errorLog || {}).sort((x, y) => y[1] - x[1]);
          return (
            <div key={a.id} className="gx-card" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontFamily: "var(--mono)", fontSize: 17 }}>{a.band ? `${a.band[0]}–${a.band[1]}` : a.total}</b>
                <span className="gx-note">{when}</span>
              </div>
              <div className="gx-note" style={{ marginTop: 4 }}>
                {a.sections.map((s) => `${SECTION_META[s.key].short} ${s.correct}/${s.total}${s.score ? " · ~" + s.score : ""}`).join("   ·   ")}
              </div>
              <button className="gx-btn ghost" style={{ padding: "4px 0", marginTop: 6 }} onClick={() => setOpen(open === a.id ? null : a.id)}>
                {open === a.id ? "▾ hide error log" : "▸ error log by type"}
              </button>
              {open === a.id && (
                <div style={{ marginTop: 4 }}>
                  {topics.length === 0 ? <p className="gx-note" style={{ margin: 0 }}>No misses on this attempt.</p> :
                    topics.map(([t, n]) => <div key={t} className="gx-stat"><span>{t}</span><b>{n}</b></div>)}
                </div>
              )}
            </div>
          );
        })
      )}
      {list.length > 0 && (
        <div className="gx-foot" style={{ marginBottom: 8 }}>
          <div className="spacer" />
          <button className="gx-btn" onClick={onClear}>Clear attempts</button>
        </div>
      )}

      <h2 className="gx-h1" style={{ fontSize: 18, marginTop: 22 }}>Question log</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px" }}>
        <select className="gx-sel" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
          <option value="ALL">All modes</option>
          <option value="full">Full Test</option>
          <option value="daily">Daily Practice</option>
        </select>
        <select className="gx-sel" value={correctFilter} onChange={(e) => setCorrectFilter(e.target.value)}>
          <option value="ALL">All answers</option>
          <option value="WRONG">Wrong only</option>
        </select>
        <select className="gx-sel" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
          <option value="ALL">All sections</option>
          <option value="Q">Quant</option>
          <option value="V">Verbal</option>
          <option value="DI">Data Insights</option>
        </select>
      </div>
      {logList.length === 0 ? (
        <p className="gx-lead">No questions logged yet for this filter.</p>
      ) : (
        logList.map((e) => (
          <QuestionLogEntry key={e.id} entry={e} item={bank.get(e.itemId)} onUpdateNote={onUpdateNote} />
        ))
      )}
      {(questionLog || []).length > 0 && (
        <div className="gx-foot" style={{ marginBottom: 8 }}>
          <div className="spacer" />
          <button className="gx-btn" onClick={onClearLog}>Clear question log</button>
        </div>
      )}

      <div className="gx-foot">
        <button className="gx-btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

/* Merge local + remote records by id, local wins on conflict (most recent
   device the user actually looked at), then re-sort chronologically. */
function mergeById(local, remote) {
  const map = new Map();
  (remote || []).forEach((r) => map.set(r.id, r));
  (local || []).forEach((l) => map.set(l.id, l));
  return Array.from(map.values());
}
const mergeAttempts = (local, remote) =>
  mergeById(local, remote).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-50);
const mergeQuestionLog = (local, remote) =>
  mergeById(local, remote).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-500);

/* ---------- root ---------- */
export default function App() {
  // a fresh randomized, difficulty-balanced form is drawn per attempt in begin()
  const [phase, setPhase] = useState("intro"); // intro | order | exam | history | results | practice
  const [sections, setSections] = useState([]);
  const [secIdx, setSecIdx] = useState(0);
  const [showCalc, setShowCalc] = useState(false);
  const [savedCount, setSavedCount] = useState(null);
  const [attempts, setAttempts] = useState(() => getJSON("gmat:attempts", []));
  const [questionLog, setQuestionLog] = useState(() => getJSON("gmat:questionLog", []));
  const [user, setUser] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("local"); // local | connecting | synced
  const skipPush = useRef({ attempts: false, questionLog: false });
  const cloudUnsub = useRef(null);

  useEffect(() => { setSavedCount(attempts.length); }, []);

  // Google sign-in drives a one-time merge (remote ∪ local, local wins ties)
  // then a live listener keeps this tab and any other signed-in device in sync.
  useEffect(() => {
    const unsubAuth = subscribeAuth(async (u) => {
      if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
      setUser(u);
      if (!u) { setCloudStatus("local"); return; }
      setCloudStatus("connecting");
      try {
        const remote = await pullUserState(u.uid);
        setAttempts((prevAttempts) => {
          const merged = mergeAttempts(prevAttempts, remote.attempts);
          setJSON("gmat:attempts", merged);
          setSavedCount(merged.length);
          pushAttempts(u.uid, merged).catch(() => {});
          return merged;
        });
        setQuestionLog((prevLog) => {
          const merged = mergeQuestionLog(prevLog, remote.questionLog);
          setJSON("gmat:questionLog", merged);
          pushQuestionLog(u.uid, merged).catch(() => {});
          return merged;
        });
        cloudUnsub.current = subscribeUserState(
          u.uid,
          (list) => { skipPush.current.attempts = true; setAttempts(list); setJSON("gmat:attempts", list); setSavedCount(list.length); },
          (list) => { skipPush.current.questionLog = true; setQuestionLog(list); setJSON("gmat:questionLog", list); }
        );
        setCloudStatus("synced");
      } catch (e) { setCloudStatus("error"); }
    });
    return () => { unsubAuth(); if (cloudUnsub.current) cloudUnsub.current(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (skipPush.current.attempts) { skipPush.current.attempts = false; return; }
    pushAttempts(user.uid, attempts).catch(() => {});
  }, [attempts, user]);

  useEffect(() => {
    if (!user) return;
    if (skipPush.current.questionLog) { skipPush.current.questionLog = false; return; }
    pushQuestionLog(user.uid, questionLog).catch(() => {});
  }, [questionLog, user]);

  function clearHistory() {
    setAttempts([]); setSavedCount(0);
    remove("gmat:attempts");
  }

  function logQuestion(entry) {
    setQuestionLog((prev) => {
      const arr = [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, note: "", ...entry }].slice(-500);
      setJSON("gmat:questionLog", arr);
      return arr;
    });
  }

  function updateNote(entryId, note) {
    setQuestionLog((prev) => {
      const arr = prev.map((e) => (e.id === entryId ? { ...e, note } : e));
      setJSON("gmat:questionLog", arr);
      return arr;
    });
  }

  function clearQuestionLog() {
    setQuestionLog([]);
    remove("gmat:questionLog");
  }

  function begin(order) {
    const forms = buildBank();
    const secs = order.map((k) => ({
      key: k, items: forms[k], responses: {}, bookmarks: [], curIdx: 0,
      timeLeft: SECTION_TIME, enteredReview: false, changedInReview: [],
      inReviewGrid: false, perQTime: {}, done: false, result: null,
    }));
    setSections(secs); setSecIdx(0); setShowCalc(false); setPhase("exam");
  }

  // tick
  useEffect(() => {
    if (phase !== "exam") return;
    const id = setInterval(() => {
      setSections((prev) => {
        if (!prev[secIdx] || prev[secIdx].done) return prev;
        const cp = prev.map((s) => ({ ...s }));
        const s = cp[secIdx];
        s.timeLeft = s.timeLeft - 1;
        if (!s.inReviewGrid) {
          const qid = s.items[s.curIdx].id;
          s.perQTime = { ...s.perQTime, [qid]: (s.perQTime[qid] || 0) + 1 };
        }
        if (s.timeLeft < 0) s.timeLeft = 0;
        return cp;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, secIdx]);

  // watch for time-out
  useEffect(() => {
    if (phase !== "exam") return;
    const s = sections[secIdx];
    if (s && !s.done && s.timeLeft <= 0) finalizeSection();
    // eslint-disable-next-line
  }, [sections, secIdx, phase]);

  function computeResult(s) {
    let correct = 0; const perQ = []; const items = [];
    s.items.forEach((it) => {
      const r = s.responses[it.id];
      const ok = isCorrect(it, r);
      if (ok) correct++;
      perQ.push({ id: it.id, topic: it.topic, diff: it.diff, correct: ok, answered: isAnswered(it, r), time: s.perQTime[it.id] || 0 });
      items.push({ band: it.diff, correct: ok });
    });
    const fit = irtFit(items);
    return { key: s.key, correct, total: s.items.length, perQ, timeUsed: SECTION_TIME - s.timeLeft, score: fit.S, seS: fit.seS };
  }

  function finalizeSection() {
    const s = sections[secIdx];
    if (!s || s.done) return;
    const result = computeResult(s);
    const updated = sections.map((x, i) => i === secIdx ? { ...x, done: true, result } : x);
    setSections(updated);
    const now = new Date().toISOString();
    s.items.forEach((it) => {
      const r = s.responses[it.id];
      const q = result.perQ.find((x) => x.id === it.id);
      logQuestion({
        itemId: it.id, mode: "full", section: s.key, topic: it.topic, diff: it.diff,
        chosenResponse: r ?? null, correct: q.correct, answered: q.answered, timestamp: now,
      });
    });
    if (secIdx + 1 < updated.length) {
      setSecIdx(secIdx + 1); setShowCalc(false);
    } else {
      setPhase("results");
      saveAttempt(updated);
    }
  }

  function saveAttempt(secs) {
    const secScores = secs.map((s) => ({ S: s.result.score, seS: s.result.seS }));
    const tot = totalFromSections(secScores);
    const errorLog = {};
    secs.forEach((s) => s.result.perQ.forEach((q) => { if (!q.correct) errorLog[q.topic] = (errorLog[q.topic] || 0) + 1; }));
    const rec = {
      id: Date.now(),
      date: new Date().toISOString(),
      order: secs.map((s) => s.key),
      sections: secs.map((s) => ({ key: s.key, correct: s.result.correct, total: s.result.total, timeUsed: s.result.timeUsed, score: s.result.score })),
      total: tot.mid, band: [tot.lo, tot.hi], errorLog,
    };
    setAttempts((prev) => {
      const arr = [...prev, rec].slice(-50);
      setJSON("gmat:attempts", arr);
      setSavedCount(arr.length);
      return arr;
    });
  }

  function setResp(qid, val) {
    setSections((prev) => {
      const cp = prev.map((s) => ({ ...s }));
      const s = cp[secIdx];
      if (s.enteredReview) {
        const already = s.changedInReview.includes(qid);
        const isChange = JSON.stringify(s.responses[qid]) !== JSON.stringify(val);
        if (!already && isChange) {
          if (s.changedInReview.length >= 3) return prev; // edit cap reached
          s.changedInReview = [...s.changedInReview, qid];
        }
      }
      s.responses = { ...s.responses, [qid]: val };
      return cp;
    });
  }
  const mutate = (fn) => setSections((prev) => { const cp = prev.map((s) => ({ ...s })); fn(cp[secIdx]); return cp; });
  const toggleBookmark = (qid) => mutate((s) => { s.bookmarks = s.bookmarks.includes(qid) ? s.bookmarks.filter((x) => x !== qid) : [...s.bookmarks, qid]; });
  const goTo = (idx) => mutate((s) => { s.curIdx = idx; s.inReviewGrid = false; });
  const openReview = () => mutate((s) => { s.inReviewGrid = true; s.enteredReview = true; });

  const goHome = () => { setPhase("intro"); setSections([]); };

  let screen;
  if (phase === "intro") {
    screen = (
      <Intro
        onStart={() => setPhase("order")} onPractice={() => setPhase("practice")} onHistory={() => setPhase("history")}
        attempts={attempts} user={user} cloudStatus={cloudStatus} onSignIn={signInWithGoogle} onSignOut={signOutUser}
      />
    );
  } else if (phase === "order") {
    screen = <OrderPick onBegin={begin} />;
  } else if (phase === "practice") {
    screen = <PracticeMode onBack={() => setPhase("intro")} onLog={logQuestion} />;
  } else if (phase === "history") {
    screen = (
      <History
        attempts={attempts}
        questionLog={questionLog}
        onBack={() => setPhase("intro")}
        onClear={clearHistory}
        onClearLog={clearQuestionLog}
        onUpdateNote={updateNote}
      />
    );
  } else if (phase === "results") {
    screen = <Results sections={sections} onRestart={goHome} savedCount={savedCount} />;
  } else {
    const s = sections[secIdx];
    if (!s) {
      screen = <div className="gx-wrap"><p style={{ padding: 24 }}>Loading…</p></div>;
    } else {
      const meta = SECTION_META[s.key];
      const item = s.items[s.curIdx];
      const warn = s.timeLeft <= 300;
      const editsLeft = s.enteredReview ? 3 - s.changedInReview.length : null;
      const answeredCount = s.items.filter((it) => isAnswered(it, s.responses[it.id])).length;
      screen = (
        <>
          <div className="gx-topbar"><div className="gx-topin">
            <span className="gx-sect">{meta.short}</span>
            <span className="gx-count">{s.inReviewGrid ? `${answeredCount}/${s.items.length} answered` : `Q ${s.curIdx + 1} / ${s.items.length}`}</span>
            {s.key === "DI" && <button className="gx-iconbtn" title="Calculator" onClick={() => setShowCalc((v) => !v)}>🧮</button>}
            {!s.inReviewGrid && (
              <button className={"gx-iconbtn" + (s.bookmarks.includes(item.id) ? " on" : "")} title="Bookmark" onClick={() => toggleBookmark(item.id)}>⚑</button>
            )}
            <span className={"gx-clock" + (warn ? " warn" : "")}>{fmt(s.timeLeft)}</span>
          </div></div>

          <div className="gx-wrap">
            {editsLeft != null && (
              <div className="gx-banner">Review &amp; Edit — you can change up to 3 answers. <b>{editsLeft} left.</b>{editsLeft === 0 ? " Further changes are locked." : ""}</div>
            )}

            {s.inReviewGrid ? (
              <div>
                <p className="gx-eyebrow" style={{ marginTop: 18 }}>Review &amp; Edit</p>
                <h1 className="gx-h1">{meta.name}</h1>
                <p className="gx-lead">Tap any question to revisit it. Bookmarked questions show a dot.</p>
                <div className="gx-grid">
                  {s.items.map((it, i) => {
                    const ans = isAnswered(it, s.responses[it.id]);
                    const flagged = s.bookmarks.includes(it.id);
                    return (
                      <button key={it.id} className={"gx-cell" + (ans ? " ans" : "") + (flagged ? " flag" : "")} onClick={() => goTo(i)}>{i + 1}</button>
                    );
                  })}
                </div>
                <div className="gx-foot">
                  <button className="gx-btn" onClick={() => goTo(s.curIdx)}>Back to questions</button>
                  <div className="spacer" />
                  <button className="gx-btn primary" onClick={finalizeSection}>End section</button>
                </div>
                <p className="gx-note">Ending the section is final and moves you to the next one. Unanswered questions are marked wrong.</p>
              </div>
            ) : (
              <div>
                <div style={{ height: 14 }} />
                <span className="gx-pill">{item.topic}</span>
                <span className="gx-pill">{item.diff}</span>
                <QuestionView item={item} resp={s.responses[item.id]} setResp={setResp} review={false} />
                <div className="gx-foot">
                  <button className="gx-btn" onClick={() => goTo(Math.max(0, s.curIdx - 1))} disabled={s.curIdx === 0}>Back</button>
                  <div className="spacer" />
                  <button className="gx-btn" onClick={openReview}>Review</button>
                  {s.curIdx < s.items.length - 1
                    ? <button className="gx-btn primary" onClick={() => goTo(s.curIdx + 1)}>Next</button>
                    : <button className="gx-btn primary" onClick={openReview}>Go to review</button>}
                </div>
              </div>
            )}
          </div>

          {s.key === "DI" && showCalc && <Calculator onClose={() => setShowCalc(false)} />}
        </>
      );
    }
  }

  return (
    <div className="gx-root"><style>{CSS}</style>
      <ErrorBoundary resetKey={phase} onHome={goHome} onHistory={() => setPhase("history")}>{screen}</ErrorBoundary>
    </div>
  );
}

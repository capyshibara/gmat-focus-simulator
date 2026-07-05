#!/usr/bin/env node
// Generates new GMAT Focus practice items via the Deepseek API and appends
// them to src/data/*.json. Scoped to the three flat-schema item types
// (PS, CR, DS) — table/chart/multi-source types are not generated here
// because their nested structures are too easy for an LLM to get
// numerically inconsistent without a dedicated verifier.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY is not set.");
  process.exit(1);
}

const COUNTS = {
  quant: Number(process.env.GEN_QUANT_COUNT ?? 5),
  cr: Number(process.env.GEN_CR_COUNT ?? 5),
  ds: Number(process.env.GEN_DS_COUNT ?? 4),
};

function loadJson(file) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));
}
function saveJson(file, data) {
  writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + "\n");
}
function nextId(items, re, prefix) {
  const max = Math.max(0, ...items.map((x) => { const m = x.id.match(re); return m ? +m[1] : 0; }));
  return (n) => `${prefix}${n}`;
}
function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

async function callDeepseek(systemPrompt, userPrompt) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    throw new Error(`Deepseek API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Deepseek response had no content");
  return JSON.parse(content);
}

function isValidChoiceItem(item) {
  return (
    typeof item.topic === "string" && item.topic.trim() &&
    ["easy", "medium", "hard"].includes(item.diff) &&
    typeof item.prompt === "string" && item.prompt.trim().length > 10 &&
    Array.isArray(item.choices) && item.choices.length === 5 &&
    item.choices.every((c) => typeof c === "string" && c.trim()) &&
    Number.isInteger(item.answer) && item.answer >= 0 && item.answer <= 4 &&
    typeof item.exp === "string" && item.exp.trim().length > 5
  );
}
function isValidDsItem(item) {
  return (
    typeof item.topic === "string" && item.topic.trim() &&
    ["easy", "medium", "hard"].includes(item.diff) &&
    typeof item.prompt === "string" && item.prompt.trim().length > 10 &&
    typeof item.s1 === "string" && item.s1.trim() &&
    typeof item.s2 === "string" && item.s2.trim() &&
    Number.isInteger(item.answer) && item.answer >= 0 && item.answer <= 4 &&
    typeof item.exp === "string" && item.exp.trim().length > 5
  );
}

async function genQuant(existing) {
  const existingPrompts = existing.map((x) => x.prompt).slice(-40);
  const out = await callDeepseek(
    "You write original GMAT Focus Edition Quantitative Reasoning (Problem Solving) practice questions. Output strict JSON only.",
    `Generate ${COUNTS.quant} new PS questions as JSON: {"items":[{"topic":string,"diff":"easy"|"medium"|"hard","prompt":string,"choices":[5 strings],"answer":0-4 index of correct choice,"exp":string explaining the correct answer and briefly why the main distractor is tempting}]}.
Cover a mix of topics (algebra, percents, ratios, statistics, number properties, geometry, rates, probability, counting). Mix difficulty. Do not duplicate any of these existing prompts (by topic or wording):
${existingPrompts.map((p) => "- " + p).join("\n")}`
  );
  return (out.items ?? []).filter(isValidChoiceItem);
}

async function genCr(existing) {
  const existingPrompts = existing.map((x) => x.prompt).slice(-40);
  const out = await callDeepseek(
    "You write original GMAT Focus Edition Verbal Reasoning Critical Reasoning practice questions. Output strict JSON only.",
    `Generate ${COUNTS.cr} new CR questions as JSON: {"items":[{"topic":"CR: <subtype>" (e.g. "CR: Weaken","CR: Strengthen","CR: Assumption","CR: Flaw","CR: Inference","CR: Evaluate","CR: Paradox","CR: Boldface"),"diff":"easy"|"medium"|"hard","prompt":string (include the question stem),"choices":[5 strings],"answer":0-4 index of correct choice,"exp":string explaining why the correct choice works and briefly why at least one trap choice is tempting}]}.
Mix subtypes and difficulty. Do not duplicate any of these existing prompts (by scenario or wording):
${existingPrompts.map((p) => "- " + p.replace(/\n/g, " ")).join("\n")}`
  );
  return (out.items ?? []).filter(isValidChoiceItem);
}

async function genDs(existing) {
  const existingPrompts = existing.filter((x) => x.type === "DS").map((x) => x.prompt).slice(-40);
  const out = await callDeepseek(
    "You write original GMAT Focus Edition Data Insights Data Sufficiency practice questions. Output strict JSON only.",
    `Generate ${COUNTS.ds} new Data Sufficiency questions as JSON: {"items":[{"topic":"DS: <area>" (e.g. algebra, number properties, statistics, geometry reasoning, inequalities, word problem),"diff":"easy"|"medium"|"hard","prompt":string (the question, not the statements),"s1":string (statement 1),"s2":string (statement 2),"answer":0-4 where 0="statement 1 alone is sufficient, statement 2 is not",1="statement 2 alone is sufficient, statement 1 is not",2="both statements together are sufficient, neither alone is",3="each statement alone is sufficient",4="the statements together are not sufficient","exp":string explaining the sufficiency of each statement}]}.
Verify the sufficiency logic carefully before answering — it must be mathematically correct. Do not duplicate any of these existing prompts:
${existingPrompts.map((p) => "- " + p).join("\n")}`
  );
  return (out.items ?? []).filter(isValidDsItem);
}

async function main() {
  const quant = loadJson("quant.json");
  const cr = loadJson("cr.json");
  const di = loadJson("di.json");

  const existingPromptSet = new Set([
    ...quant.map((x) => norm(x.prompt)),
    ...cr.map((x) => norm(x.prompt)),
    ...di.map((x) => norm(x.prompt)),
  ]);

  let added = { quant: 0, cr: 0, ds: 0 };

  try {
    const newQuant = await genQuant(quant);
    let nextQ = Math.max(0, ...quant.map((x) => +(x.id.match(/^Q(\d+)$/)?.[1] ?? 0))) + 1;
    for (const item of newQuant) {
      const key = norm(item.prompt);
      if (existingPromptSet.has(key)) continue;
      existingPromptSet.add(key);
      quant.push({ id: `Q${nextQ++}`, section: "Q", type: "PS", ...item });
      added.quant++;
    }
  } catch (e) {
    console.error("Quant generation failed:", e.message);
  }

  try {
    const newCr = await genCr(cr);
    let nextCr = Math.max(0, ...cr.map((x) => +(x.id.match(/^V_CR(\d+)$/)?.[1] ?? 0))) + 1;
    for (const item of newCr) {
      const key = norm(item.prompt);
      if (existingPromptSet.has(key)) continue;
      existingPromptSet.add(key);
      cr.push({ id: `V_CR${nextCr++}`, ...item });
      added.cr++;
    }
  } catch (e) {
    console.error("CR generation failed:", e.message);
  }

  try {
    const newDs = await genDs(di);
    let nextDi = Math.max(0, ...di.map((x) => +(x.id.match(/^DI(\d+)$/)?.[1] ?? 0))) + 1;
    for (const item of newDs) {
      const key = norm(item.prompt);
      if (existingPromptSet.has(key)) continue;
      existingPromptSet.add(key);
      di.push({ id: `DI${nextDi++}`, type: "DS", ...item });
      added.ds++;
    }
  } catch (e) {
    console.error("DS generation failed:", e.message);
  }

  saveJson("quant.json", quant);
  saveJson("cr.json", cr);
  saveJson("di.json", di);

  console.log(`Added: ${added.quant} PS, ${added.cr} CR, ${added.ds} DS`);
  console.log(`Bank totals: quant=${quant.length}, cr=${cr.length}, di=${di.length}`);

  const totalAdded = added.quant + added.cr + added.ds;
  process.exit(totalAdded > 0 ? 0 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Collects every English wording in the app (the second argument of t("…", "…") and the `en:` of { mn, en } texts) into
// src/locales/source.json, keyed by a short hash. A wording built from a template literal is kept with numbered
// placeholders ({0}, {1}, …) in place of its ${…} parts and also listed in src/locales/templates.json, so a translation
// can be found for the finished string at run time. Both branches of a `?:` are collected. Translations of wordings
// that left the code are dropped from src/locales/<code>.json. Run: npm run i18n:extract (also runs before every build).
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const OUT = join(SRC, "locales");
const SKIP = [/src\/lib\/legalText\.ts$/, /src\/locales\//]; // the legal texts stay in Mongolian and English

/** 32-bit FNV-1a as 8 hex digits: the same function as hashText in src/lib/i18n.ts. */
export function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The wordings an expression can produce: literals, templates (with {n} holes), both sides of ?: and ??. */
function wordings(node, out) {
  if (!node) return;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return wordings(node.expression, out);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return out.push({ text: node.text, tmpl: false });
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    node.templateSpans.forEach((s, i) => { text += `{${i}}` + s.literal.text; });
    return out.push({ text, tmpl: true });
  }
  if (ts.isConditionalExpression(node)) { wordings(node.whenTrue, out); wordings(node.whenFalse, out); return; }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) { wordings(node.left, out); wordings(node.right, out); }
}

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } })(SRC);

const seen = new Map();
let fileCount = 0;
for (const f of files.sort()) {
  const rel = relative(ROOT, f);
  if (SKIP.some((re) => re.test(rel))) continue;
  fileCount++;
  const code = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 2) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (name === "t") wordings(node.arguments[1], found);
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "en" && ts.isObjectLiteralExpression(node.parent)
      && node.parent.properties.length === 2 && node.parent.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "mn")) wordings(node.initializer, found);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const v of found) {
    if (!v.text.trim() || /^(\{\d+\}|\s|[\d.,:%+\-−—·/()])*$/.test(v.text)) continue; // nothing to translate
    const h = hashText(v.text);
    if (!seen.has(h)) seen.set(h, { h, en: v.text, tmpl: v.tmpl, file: rel });
  }
}
const all = [...seen.values()];
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "source.json"), JSON.stringify(all.map(({ h, en, file }) => ({ h, en, file })), null, 1) + "\n");
writeFileSync(join(OUT, "templates.json"), JSON.stringify(all.filter((x) => x.tmpl).map(({ h, en }) => ({ h, en }))) + "\n");

// A translation whose English wording left the code is dropped, so the files hold only what is still shown.
let dropped = 0;
for (const f of readdirSync(OUT).filter((f) => /^[a-z]{2}\.json$/.test(f))) {
  const cat = JSON.parse(readFileSync(join(OUT, f), "utf8"));
  const kept = Object.fromEntries(Object.entries(cat).filter(([h]) => seen.has(h)));
  const gone = Object.keys(cat).length - Object.keys(kept).length;
  if (gone) { dropped += gone; writeFileSync(join(OUT, f), JSON.stringify(kept, null, 1) + "\n"); }
}
if (dropped) console.log(`dropped ${dropped} translations of wordings no longer in the code`);
console.log(`${all.length} wordings (${all.filter((x) => x.tmpl).length} templates) from ${fileCount} files`);

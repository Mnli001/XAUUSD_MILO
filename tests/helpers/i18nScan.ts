import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const CYRILLIC = /[Ѐ-ӿ]/;

export type Untranslated = { file: string; line: number; kind: string; text: string; start: number; end: number };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** `t("…", "…")`, `v.t("…", "…")`: the text already has its English beside it. */
function insideTranslation(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (name === "t" && n.arguments.length === 2) return true;
    }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "mn" && ts.isObjectLiteralExpression(n.parent) && n.parent.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "en")) return true;
    // Long prose is written once per language: `somethingMn` holds the Mongolian, `somethingEn` its English twin.
    if (ts.isFunctionDeclaration(n) && n.name && /Mn$/.test(n.name.text)) return true;
    if (ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) return false;
  }
  return false;
}

/** Every piece of Mongolian text in the source that has no English beside it. A line ending in `// i18n-ok` is a key, not text. */
export function findUntranslated(root: string): Untranslated[] {
  const found: Untranslated[] = [];
  const twins: { file: string; mn: string }[] = [];
  for (const file of walk(root)) {
    const code = readFileSync(file, "utf8");
    const lines = code.split("\n");
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const names = new Set<string>();
    sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text); });
    for (const name of names) if (/Mn$/.test(name) && !names.has(name.replace(/Mn$/, "En"))) twins.push({ file, mn: name });
    const visit = (node: ts.Node) => {
      const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isJsxText(node) || ts.isRegularExpressionLiteral(node);
      // A template is judged by its own wording, not by what its ${…} parts contain.
      const own = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((s) => s.literal.text).join("") : node.getText(sf);
      if (isText && CYRILLIC.test(own)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        if (!/i18n-ok/.test(lines[line]) && !insideTranslation(node)) found.push({ file, line: line + 1, kind: ts.SyntaxKind[node.kind], text: node.getText(sf), start: node.getStart(sf), end: node.getEnd() });
        if (ts.isTemplateExpression(node)) return; // reported as one piece
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  for (const t of twins) found.push({ file: t.file, line: 0, kind: "MissingEnglishTwin", text: t.mn, start: 0, end: 0 });
  return found;
}

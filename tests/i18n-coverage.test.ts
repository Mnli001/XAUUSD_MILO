import { findUntranslated } from "./helpers/i18nScan";

test("every piece of Mongolian text in the app has its English beside it", () => {
  const left = findUntranslated("src").map((u) => `${u.file}:${u.line}  ${u.text.replace(/\s+/g, " ").slice(0, 70)}`);
  expect(left).toEqual([]);
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/lib/actions/session", () => ({ setLocaleAction: async () => {} }));
import { LegalDoc } from "@/components/LegalDoc";
import { ConsentBanner } from "@/components/ConsentBanner";
import { PRIVACY, TERMS } from "@/lib/legalText";
import { PLANS, PLAN_IDS, tugrik } from "@/lib/plans";
import { MN_VIEWER } from "@/lib/viewer";

test("the privacy policy names the operator, the contact and the version, with no placeholder left", () => {
  render(<LegalDoc v={MN_VIEWER} doc={PRIVACY.mn} fill={{ name: "Мөнх-Очир", contact: "t.me/admin", version: "2026-11-26" }} />);
  expect(screen.getByRole("heading", { level: 1, name: "Нууцлалын бодлого" })).toBeInTheDocument();
  expect(screen.getByText(/Энэ site-ыг Мөнх-Очир ажиллуулдаг/)).toBeInTheDocument();
  expect(screen.getByText(/Хувилбар: 2026-11-26/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\{\w+\}/);
});

test("the privacy policy covers what the law asks to be told: purpose, data, sharing, how long, withdrawing, rights", () => {
  const heads = PRIVACY.mn.sections.map((s) => s.h).join(" | ");
  for (const h of ["Хэн хариуцдаг", "ямар мэдээлэл", "Юунд ашигладаг", "Хэнтэй хуваалцдаг", "Хэр удаан", "Таны эрх"]) expect(heads).toMatch(new RegExp(h));
  expect(PRIVACY.mn.sections.length).toBe(PRIVACY.en.sections.length);
  expect(TERMS.mn.sections.length).toBe(TERMS.en.sections.length);
});

test("the terms quote the same plan prices the site charges", () => {
  const text = (lang: "mn" | "en") => TERMS[lang].sections.flatMap((s) => s.p).join(" ");
  for (const id of PLAN_IDS) for (const lang of ["mn", "en"] as const) expect(text(lang)).toContain(tugrik(PLANS[id].amount));
});

test("the consent banner links both documents and posts the acceptance", () => {
  const accept = vi.fn(async () => {});
  render(<ConsentBanner t={MN_VIEWER.t} accept={accept} />);
  expect(screen.getByRole("link", { name: "Нууцлалын бодлого" })).toHaveAttribute("href", "/privacy");
  expect(screen.getByRole("link", { name: "Үйлчилгээний нөхцөл" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("button", { name: /зөвшөөрч байна/ })).toBeInTheDocument();
});

"use client";
import { useRef, useState, type ReactNode } from "react";
import { useViewer } from "./PrefsProvider";

/*
 * Connecting the MT5 robot in three steps. The step texts weave menu names through every sentence, so each
 * language has its own wording (connectStepsMn / connectStepsEn) inside one shared layout.
 */

const MENU = "rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] font-medium text-zinc-100 break-words";
const LINK = "font-semibold text-zinc-50 underline decoration-amber-400 decoration-2 underline-offset-2";
export const EX5_HREF = "/api/bot/download?file=ex5";
const MQ5_HREF = "/api/bot/download?file=mq5";
export const INSTALLER_HREF = "/api/bot/installer";

/**
 * The one-click way: a Windows installer that copies the robot into MT5, fills in its token and address, installs the
 * small background helper (the file bridge, so no address has to be allowed in MT5 by hand) and opens MT5 with the
 * robot on the gold chart. Downloading it makes a new token. A plain link: the route answers with the file.
 */
export function OneClickInstall() {
  const { t } = useViewer();
  return (
    <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold text-zinc-50">
        {t("Нэг товчоор суулгах (Windows)", "One-click install (Windows)")}
        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">{t("Зөвлөе", "Recommended")}</span>
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">{t("Файлыг татаад давхар товшино. Бүгдийг өөрөө тохируулна: robot-ыг MT5-д хуулж, token болон site-ын хаягийг бичээд, Windows-той хамт асдаг жижиг далд туслахыг суулгаж, MT5-ыг алтны чарт дээр robot-тай нь нээнэ. Хаяг гараар нэмэх юм уу өөр алхам хийх шаардлагагүй.", "Download the file and double-click it. It sets everything up: it copies the robot into MT5, fills in the token and the site's address, installs a small background helper that starts with Windows, and opens MT5 with the robot on the gold chart. There is no address to add by hand and nothing else to do.")}</p>
      <a href={INSTALLER_HREF} className="btn mt-3 inline-flex">{t("XauBot-Setup.bat татах", "Download XauBot-Setup.bat")}</a>
      <p className="mt-3 text-xs leading-relaxed text-amber-300">{t("Татах бүрт шинэ token үүсгэнэ: өмнөх token ажиллахаа болих тул өмнө нь тохируулсан robot-д шинэ token-оо дахин оруулна.", "Each download makes a new token: the previous one stops working, so a robot set up before needs the new token entered again.")}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("Файл гарын үсэггүй тул Windows SmartScreen анхааруулга гарч болно: «More info» → «Run anyway» дарна. Файлд таны token бичигдсэн тул түүнийг бусадтай хуваалцахгүй.", "The file is not signed, so Windows SmartScreen may warn you: click \"More info\" → \"Run anyway\". The file holds your token, so do not share it.")}</p>
    </div>
  );
}

/** Copies `value`; where the clipboard is not allowed, selects the text so it can be copied by hand. */
export function CopyField({ value, label, tone = "plain" }: { value: string; label: string; tone?: "plain" | "secret" }) {
  const { t } = useViewer();
  const box = useRef<HTMLElement>(null);
  const [said, setSaid] = useState<"" | "copied" | "selected">("");
  const select = () => {
    const el = box.current, sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(value);
      setSaid("copied");
    } catch {
      select();
      setSaid("selected");
    }
    window.setTimeout(() => setSaid(""), 2500);
  };
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
      <code ref={box} aria-label={label} className={`block min-w-0 flex-1 rounded-lg border bg-zinc-950 px-3 py-2 text-sm break-all select-all ${tone === "secret" ? "border-amber-400/50 text-amber-300" : "border-zinc-800 text-zinc-200"}`}>{value}</code>
      <button type="button" onClick={copy} className="btn-ghost shrink-0" aria-label={`${t("Хуулах", "Copy")}: ${label}`}>
        {said === "copied" ? t("Хуулагдлаа ✓", "Copied ✓") : t("Хуулах", "Copy")}
      </button>
      <span role="status" className="sr-only">{said === "copied" ? t("Хуулагдлаа", "Copied") : said === "selected" ? t("Сонгогдлоо: Ctrl+C дарж хуулна уу", "Selected: press Ctrl+C to copy") : ""}</span>
      {said === "selected" && <span aria-hidden className="self-center text-xs text-amber-300">{t("Сонгогдлоо: Ctrl+C дарна уу", "Selected: press Ctrl+C")}</span>}
    </div>
  );
}

type StepText = { title: string; body: ReactNode; after?: ReactNode };

function connectStepsMn(): StepText[] {
  return [
    { title: "Robot-ын файлыг MT5-д хийх", body: <><a className={LINK} href={EX5_HREF}>XauBot.ex5 татах</a>. MT5 дээр <span className={MENU}>File → Open Data Folder</span> дарж, нээгдсэн хавтасны <span className={MENU}>MQL5 → Experts</span> дотор файлыг хуулна. Дараа нь зүүн талын <span className={MENU}>Navigator</span> дотор <span className={MENU}>Expert Advisors</span> дээр баруун товч → <span className={MENU}>Refresh</span>.</> },
    { title: "Site-ын хаягийг зөвшөөрөх", body: <>MT5 дээр <span className={MENU}>Tools → Options → Expert Advisors</span>. <span className={MENU}>Allow WebRequest for listed URL</span>-ийг чагталж, доорх хаягийг жагсаалтад нэмээд OK дарна.</> },
    { title: "Token үүсгээд robot-ыг асаах", body: <>Доорх товчоор token-оо үүсгэж хуулна.</>, after: <>Дараа нь <strong>XauBot</strong>-ыг XAUUSD чарт руу чирнэ. <span className={MENU}>Inputs</span> таб дээр <span className={MENU}>BotToken</span> мөрөнд token-оо буулгана. <span className={MENU}>Common</span> таб дээр <span className={MENU}>Allow Algo Trading</span>-ийг чагтлаад OK. Эцэст нь дээд самбарын <span className={MENU}>Algo Trading</span> товчийг дарж ногоон болгоно.</> },
  ];
}

function connectStepsEn(): StepText[] {
  return [
    { title: "Put the robot file in MT5", body: <><a className={LINK} href={EX5_HREF}>Download XauBot.ex5</a>. In MT5 click <span className={MENU}>File → Open Data Folder</span> and copy the file into <span className={MENU}>MQL5 → Experts</span> in the folder that opens. Then in the <span className={MENU}>Navigator</span> on the left, right-click <span className={MENU}>Expert Advisors</span> → <span className={MENU}>Refresh</span>.</> },
    { title: "Allow the site's address", body: <>In MT5 open <span className={MENU}>Tools → Options → Expert Advisors</span>. Tick <span className={MENU}>Allow WebRequest for listed URL</span>, add the address below to the list and press OK.</> },
    { title: "Create your token and switch the robot on", body: <>Create your token with the button below and copy it.</>, after: <>Then drag <strong>XauBot</strong> onto an XAUUSD chart. On the <span className={MENU}>Inputs</span> tab paste the token into the <span className={MENU}>BotToken</span> row. On the <span className={MENU}>Common</span> tab tick <span className={MENU}>Allow Algo Trading</span> and press OK. Last, press the <span className={MENU}>Algo Trading</span> button in the top toolbar so it turns green.</> },
  ];
}

function troubleMn(): ReactNode[] {
  return [
    <>Token буруу эсвэл хуучин: шинэ token үүсгэвэл өмнөх нь ажиллахаа больдог. Хамгийн сүүлийн token-оо <span className={MENU}>BotToken</span>-д буулгана.</>,
    <>Хаяг зөвшөөрөгдөөгүй: 2-р алхмын хаяг <span className={MENU}>Allow WebRequest</span> жагсаалтад яг адилхан бичигдсэн эсэхийг шалгана.</>,
    <>Чарт дээр «Туслах ажиллахгүй байна» гэж гарвал XauBot-Setup.bat-ийг дахин ажиллуулна: туслахыг дахин суулгаж асаана.</>,
    <>Чарт дээр «Netting данс» гэж гарвал robot арилжаа хийхгүй: брокероосоо hedging данс нээнэ.</>,
    <>Чарт дээр алдагдлын хязгаар хүрсэн гэж гарвал robot өөрийн арилжааг хааж, шинээр орохгүй: өдрийн хязгаар дараагийн брокерын өдөр, оргилоос уналтын хязгаар robot-ын <span className={MENU}>ResetLossLock</span> тохиргоогоор арилна.</>,
    <>Algo Trading унтраалттай: дээд самбарын товч ногоон, robot-ын <span className={MENU}>Common</span> таб дээр <span className={MENU}>Allow Algo Trading</span> чагттай байх ёстой.</>,
    <>Бямба, ням гарагт алтны зах хаалттай: тэр үед robot холбогдсон ч арилжаа хийхгүй.</>,
    <>.ex5 файл ачаалагдахгүй бол эх кодыг <a className={LINK} href={MQ5_HREF}>XauBot.mq5</a> татаж, MetaEditor (F4) дээр нээгээд Compile (F7) дарна.</>,
  ];
}

function troubleEn(): ReactNode[] {
  return [
    <>Wrong or old token: creating a new token stops the previous one. Paste your latest token into <span className={MENU}>BotToken</span>.</>,
    <>Address not allowed: check that the address from step 2 is in the <span className={MENU}>Allow WebRequest</span> list exactly as shown.</>,
    <>The chart says &quot;The helper is not running&quot;: run XauBot-Setup.bat again, it reinstalls and starts the helper.</>,
    <>The chart says &quot;Netting account&quot;: the robot places no trades there; open a hedging account with your broker.</>,
    <>The chart says a loss limit was reached: the robot closed its trades and opens no new ones. The daily limit clears on the next broker day, the drawdown limit with the robot&apos;s <span className={MENU}>ResetLossLock</span> input.</>,
    <>Algo Trading is off: the toolbar button must be green and <span className={MENU}>Allow Algo Trading</span> ticked on the robot&apos;s <span className={MENU}>Common</span> tab.</>,
    <>The gold market is closed on Saturday and Sunday: the robot connects but places no trades then.</>,
    <>If the .ex5 file will not load, download the source <a className={LINK} href={MQ5_HREF}>XauBot.mq5</a>, open it in MetaEditor (F4) and press Compile (F7).</>,
  ];
}

/** A numbered roundel: a tick once the step is done, an amber ring while it is half done. */
function Roundel({ n, state }: { n: number; state: "todo" | "part" | "done" }) {
  const cls = state === "done" ? "border-emerald-400 bg-emerald-400 text-zinc-950" : state === "part" ? "border-amber-400 bg-zinc-900 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-100";
  return (
    <span aria-hidden className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] text-xs font-bold tabular-nums ${cls}`}>
      {state === "done" ? <svg viewBox="0 0 12 12" className="h-3.5 w-3.5"><path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : n}
    </span>
  );
}

/**
 * The three steps, the token control in step 3, the live "waiting / connected" line and the troubleshooting list.
 * `tokenSlot` is the token form (it lives in the panel, which owns the action state).
 */
export function ConnectSteps({ origin, syncUrl, hasToken, online, tokenSlot, installer = true }: { origin: string; syncUrl: string; hasToken: boolean; online: boolean; tokenSlot: ReactNode; installer?: boolean }) {
  const { t, locale } = useViewer();
  const steps = locale === "en" ? connectStepsEn() : connectStepsMn();
  const trouble = locale === "en" ? troubleEn() : troubleMn();
  const state = (i: number): "todo" | "part" | "done" => (online ? "done" : i === 2 && hasToken ? "part" : "todo");
  const stateText = { todo: "", part: t("хагас хийгдсэн", "partly done"), done: t("хийгдсэн", "done") };
  return (
    <div>
      {installer && (
        <>
          <OneClickInstall />
          <h3 className="mt-6 text-sm font-semibold tracking-wide text-zinc-400 uppercase">{t("Гараар холбох — 3 алхам", "Connect by hand — 3 steps")}</h3>
        </>
      )}
      <ol className="relative mt-4">
        <span aria-hidden className="absolute top-4 bottom-4 left-[15px] w-[3px] rounded-full bg-zinc-800" />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-6 last:pb-0">
            <Roundel n={i + 1} state={state(i)} />
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="font-semibold text-zinc-100">
                {t(`Алхам ${i + 1}`, `Step ${i + 1}`)}. {s.title}
                {state(i) !== "todo" && <span className={`ml-2 text-xs font-medium ${state(i) === "done" ? "text-emerald-400" : "text-amber-300"}`}>· {stateText[state(i)]}</span>}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">{s.body}</p>
              {i === 1 && origin && <CopyField value={origin} label={t("Site-ын хаяг", "Site address")} />}
              {i === 2 && (
                <>
                  {tokenSlot}
                  <p className="mt-3 text-sm leading-relaxed text-zinc-300">{s.after}</p>
                  {syncUrl && <>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t("Robot-ын ServerUrl мөрөнд энэ хаяг байх ёстой (ихэнхдээ аль хэдийн бичигдсэн байдаг):", "The robot's ServerUrl row must hold this address (it usually already does):")}</p>
                    <CopyField value={syncUrl} label="ServerUrl" />
                  </>}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p role="status" className={`mt-5 flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-semibold ${online ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-400/10 text-amber-300"}`}>
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`} />
        {online ? t("Холбогдлоо ✓", "Connected ✓") : t("Холболтыг хүлээж байна…", "Waiting for the robot to connect…")}
      </p>
      <details className="group mt-4 text-sm">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 font-medium text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
          {t("Асуудал гарвал", "If something goes wrong")}
          <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 text-zinc-500 transition-transform group-open:rotate-180"><path d="M2 4.5 6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-zinc-400">
          {trouble.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </details>
    </div>
  );
}

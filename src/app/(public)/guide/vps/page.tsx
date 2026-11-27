import Link from "next/link";
import type { ReactNode } from "react";
import { getT, getViewer } from "@/lib/prefs.server";
import { BrandName } from "@/components/BrandMark";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Disclaimer } from "@/components/Disclaimer";
import type { T } from "@/lib/i18n";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Robot-ыг VPS дээр 24/7 ажиллуулах", "Run the robot 24/7 on a VPS"), description: t("Хямд Windows VPS түрээслээд MT5, XauBot-ыг өдөр шөнөгүй ажиллуулах энгийн алхмууд.", "Plain steps to rent a cheap Windows VPS and keep MT5 and XauBot running day and night.") };
}

const MENU = "rounded-md border px-1.5 py-0.5 text-[0.92em] font-medium whitespace-nowrap text-zinc-200";
const LINK = "font-semibold text-amber-300 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-200";
const menu = (s: string) => <span className={MENU} style={{ borderColor: "var(--hairline)" }}>{s}</span>;

/** The steps, each a heading and what to do, in the reader's language. */
const steps = (t: T): { title: string; body: ReactNode }[] => [
  {
    title: t("Windows VPS түрээслэх", "Rent a Windows VPS"),
    body: (
      <>
        <p>{t("VPS бол интернэтэд байнга асаалттай байдаг түрээсийн компьютер. Таны компьютер унтарсан ч robot ажилласаар байна.", "A VPS is a rented computer that stays on in a data centre. The robot keeps working even when your own computer is off.")}</p>
        <ul className="mt-3 list-disc space-y-1.5 ps-5 marker:text-zinc-600">
          <li>{t("Систем: Windows Server 2019 эсвэл 2022.", "System: Windows Server 2019 or 2022.")}</li>
          <li>{t("Хүчин чадал: 1–2 vCPU, 2 GB RAM, 30 GB+ диск. Нэг MT5-д хангалттай.", "Size: 1–2 vCPU, 2 GB RAM, 30 GB+ disk. Enough for one MT5.")}</li>
          <li>{t("Үнэ: ойролцоогоор сард $5–10. \"Forex VPS\" эсвэл \"Windows VPS\" гэж хайгаарай.", "Price: about $5–10 a month. Search for \"Forex VPS\" or \"Windows VPS\".")}</li>
          <li>{t("Байршил: broker-ынхоо server-т ойр (ихэнхдээ Лондон эсвэл Европ). Зарим broker тодорхой хэмжээний депозиттэй бол VPS үнэгүй өгдөг тул асуугаарай.", "Location: close to your broker's server (often London or Europe). Some brokers give a free VPS above a certain deposit, so ask yours.")}</li>
        </ul>
      </>
    ),
  },
  {
    title: t("VPS-тэй холбогдох", "Connect to the VPS"),
    body: (
      <>
        <p>{t("Түрээслэсний дараа IP хаяг, хэрэглэгчийн нэр (ихэнхдээ Administrator), нууц үг ирнэ.", "After renting you get an IP address, a user name (often Administrator) and a password.")}</p>
        <ul className="mt-3 list-disc space-y-1.5 ps-5 marker:text-zinc-600">
          <li>{t("Windows компьютерээс: Start цэснээс ", "From a Windows PC: open ")}{menu("Remote Desktop Connection")}{t(" (mstsc) нээж IP-гээ оруулна.", " (mstsc) from the Start menu and enter the IP.")}</li>
          <li>{t("Утаснаас: Microsoft-ын ", "From a phone: install Microsoft's ")}{menu("Windows App")}{t(" (хуучин нэр нь Remote Desktop) app-ыг суулгаад IP-гээ нэмнэ.", " app (formerly Remote Desktop) and add the IP.")}</li>
          <li>{t("Mac-аас: App Store-оос мөн Windows App.", "From a Mac: the same Windows App from the App Store.")}</li>
        </ul>
      </>
    ),
  },
  {
    title: t("MT5 суулгаж дансандаа нэвтрэх", "Install MT5 and sign in to your account"),
    body: (
      <p>
        {t("VPS доторх browser-ээр broker-ынхоо сайтаас MetaTrader 5 татаж суулгана. MT5 дээр ", "In the VPS's browser, download MetaTrader 5 from your broker's site and install it. In MT5 open ")}
        {menu("File → Login to Trade Account")}
        {t(" дарж арилжааны данс руугаа нэвтэрнэ (нууц үгээ хадгалах сонголтыг чагтална). Жижиг данстай бол cent данс ашиглаарай.", " and sign in to your trading account (tick the option to save the password). With a small balance, use a cent account.")}
      </p>
    ),
  },
  {
    title: t("XauBot-ыг хуулж холбох", "Copy XauBot in and connect it"),
    body: (
      <p>
        {t("VPS доторх browser-ээр энэ сайт руу нэвтэрч ", "In the VPS's browser, sign in to this site and open the ")}
        <Link href="/bot" className={LINK}>{t("Bot хуудас", "Bot page")}</Link>
        {t("-ыг нээнэ. Тэнд байгаа 3 алхмыг дагана: XauBot.ex5-ыг ", ". Follow its 3 steps: put XauBot.ex5 into ")}
        {menu("MQL5 → Experts")}
        {t(" хавтас руу хуулах, site-ын хаягийг ", ", allow the site's address under ")}
        {menu("Allow WebRequest")}
        {t("-д зөвшөөрөх, token-оо оруулаад XAUUSD чарт дээр асаах. Дээд самбарын ", ", then enter your token and start it on an XAUUSD chart. The ")}
        {menu("Algo Trading")}
        {t(" товч ногоон байх ёстой.", " button in the toolbar must be green.")}
      </p>
    ),
  },
  {
    title: t("Байнга ажиллуулж байх", "Keep it running"),
    body: (
      <ul className="list-disc space-y-1.5 ps-5 marker:text-zinc-600">
        <li>{t("Remote Desktop-оос гарахдаа цонхыг X-ээр хаана. ", "When you leave Remote Desktop, close the window with X. ")}<strong className="text-zinc-100">{t("Sign out хийж болохгүй", "Do not sign out")}</strong>{t(": тэгвэл MT5 хаагдана.", ": that closes MT5.")}</li>
        <li>{t("MT5-ыг Windows-ын Startup руу нэмбэл VPS дахин асахад өөрөө нээгдэнэ: ", "Add MT5 to Windows Startup so it opens by itself after a restart: press ")}{menu("Win + R")}{t(" → ", " → ")}{menu("shell:startup")}{t(" бичээд MT5-ын shortcut-ыг тэнд хуулна.", " and copy the MT5 shortcut into that folder.")}</li>
        <li>{t("Windows Update VPS-ыг дахин ачаалж болно. Долоо хоногт нэг удаа холбогдож MT5 нээлттэй, Algo Trading ногоон эсэхийг шалгаарай.", "Windows Update can restart the VPS. Connect once a week and check that MT5 is open and Algo Trading is green.")}</li>
        <li>{t("Санах ой хэмнэхийн тулд MT5 дээр хэрэггүй чартуудаа хаана.", "Close the charts you do not need in MT5 to save memory.")}</li>
      </ul>
    ),
  },
  {
    title: t("Утаснаасаа хянах", "Watch it from your phone"),
    body: (
      <p>
        {t("Дохио, үр дүн Telegram-аар ирнэ. Robot online эсэх, эрсдэл, асаах/зогсоох нь ", "Signals and results arrive on Telegram. Whether the robot is online, its risk, and start or stop are on the ")}
        <Link href="/bot" className={LINK}>{t("Bot хуудсанд", "Bot page")}</Link>
        {t(" утаснаас ч харагдана. MT5-ын утасны app-аар нэг данс руугаа нэвтэрвэл robot-ын нээсэн арилжааг харж болно (утасны app өөрөө robot ажиллуулдаггүй).", ", from your phone too. Sign in to the same account in the MT5 phone app to see the trades the robot opened (the phone app cannot run the robot itself).")}
      </p>
    ),
  },
];

export default async function VpsGuidePage() {
  const v = await getViewer();
  const { t } = v;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <Link href="/" aria-label="XAU Analytics"><BrandName /></Link>
        <LanguageSwitch locale={v.locale} />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">{t("Заавар", "Guide")}</p>
        <h1 className="page-title mt-2">{t("Robot-ыг VPS дээр 24/7 ажиллуулах", "Run the robot 24/7 on a VPS")}</h1>
        <p className="page-lede">{t("Robot таны MT5 дотор ажилладаг тул MT5 үргэлж асаалттай байх ёстой. Хамгийн хялбар нь сард ~$5–10-ийн Windows VPS. 20–30 минутад тохируулна.", "The robot runs inside your MT5, so MT5 must always be on. The easiest way is a ~$5–10 a month Windows VPS. It takes 20–30 minutes to set up.")}</p>

        <div className="glass-banner mt-6 text-sm leading-relaxed text-zinc-300">
          <p><strong className="text-zinc-50">{t("Зөвхөн утастай юу?", "Only a phone?")}</strong> {t("Telegram дохиогоор гараар арилжаалж болно: орох үнэ, stop, target бүгд мессежид байгаа. Robot-д л Windows компьютер эсвэл VPS хэрэгтэй.", "You can trade the Telegram signals by hand: the entry, stop and target are all in the message. Only the robot needs a Windows PC or VPS.")}</p>
        </div>

        <ol className="mt-10 space-y-5">
          {steps(t).map((s, i) => (
            <li key={s.title} className="card">
              <h2 className="flex items-center gap-3 text-lg font-semibold text-zinc-50">
                <span aria-hidden className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base text-amber-300" style={{ borderColor: "var(--hairline-gold)" }}>{i + 1}</span>
                <span><span className="sr-only">{t(`Алхам ${i + 1}: `, `Step ${i + 1}: `)}</span>{s.title}</span>
              </h2>
              <div className="mt-3 leading-relaxed text-zinc-300">{s.body}</div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register" className="btn min-h-12 px-7">{t("Үнэгүй бүртгүүлэх", "Register free")}</Link>
          <Link href="/#faq" className="btn-ghost min-h-12 px-6">{t("Түгээмэл асуултууд", "Common questions")}</Link>
        </div>
      </main>
      <Disclaimer v={v} />
    </div>
  );
}

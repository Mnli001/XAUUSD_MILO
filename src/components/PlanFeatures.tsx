import Link from "next/link";
import type { T } from "@/lib/i18n";

/** What a plan opens, each item a page or message that exists in the app today. Every plan opens all of it. */
export const planFeatures = (t: T): { title: string; body: string; href: string }[] => [
  { title: t("Telegram дохио", "Telegram signals"), body: t("Зураг + текст: чиглэл, орох үнэ, stop, target. 15 минутын лаа хаагдсанаас ~2 минутын дотор.", "Picture + text: side, entry, stop, target. Within ~2 minutes of the 15-minute candle closing."), href: "/settings" },
  { title: t("MT5 robot (XauBot)", "MT5 robot (XauBot)"), body: t("Дохиог таны MT5 данс дээр автоматаар нээж, хаана. Эрсдэл, асаах/зогсоохыг вэбээс.", "Opens and closes the signals on your own MT5 account. Risk, start and stop from the web."), href: "/bot" },
  { title: t("Өглөөний тойм 08:00", "Morning brief at 08:00"), body: t("Даваа–баасан Telegram-аар: үнэ, trend, өнөөдрийн 3 setup, чухал мэдээ.", "Monday to Friday on Telegram: price, trends, today's 3 setups, the key releases."), href: "/settings" },
  { title: t("Setup хуудас", "Setup page"), body: t("3 сешний breakout live чарт дээр: хүрээ, орох цэг, stop, target.", "The 3 session breakouts on the live chart: range, entry, stop, target."), href: "/setup" },
  { title: t("Өнөөдөр", "Today"), body: t("Давамгай тал, цаг тутмын өсөх/унах магадлал, түвшингүүд.", "The leading side, hourly rise/fall odds, key levels."), href: "/today" },
  { title: t("Мэдээний календарь", "News calendar"), body: t("NFP, CPI, FOMC: хэзээ гарах, өмнө нь алт хэрхэн хөдөлсөн.", "NFP, CPI, FOMC: when they land and how gold moved after them before."), href: "/news" },
  { title: t("Журнал ба гүйцэтгэл", "Journal and performance"), body: t("MT5-ын хаасан арилжаа автоматаар орж, win rate, P&L, drawdown-ыг задлана.", "Your MT5 closed trades arrive on their own, with win rate, P&L and drawdown broken down."), href: "/journal" },
  { title: t("Дасгал (bar replay)", "Practice (bar replay)"), body: t("Өнгөрсөн өдрийг лаа лаагаар тоглуулж, мөнгө эрсдэлгүй дадлага хийнэ.", "Replay a past day bar by bar and practise with no money at risk."), href: "/practice" },
  { title: t("Сануулга", "Alerts"), body: t("Үнэ болон нөхцөлийн сануулга утас, Telegram руу.", "Price and condition alerts to your phone and Telegram."), href: "/today" },
];

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clipRule="evenodd" />
    </svg>
  );
}

/** The checklist. `links` turns each title into a link to its page (for signed-in readers). */
export function PlanFeatureList({ t, links = false, className = "" }: { t: T; links?: boolean; className?: string }) {
  return (
    <ul className={`grid gap-x-6 gap-y-3.5 sm:grid-cols-2 ${className}`}>
      {planFeatures(t).map((f) => (
        <li key={f.title} className="flex gap-3">
          <Check />
          <span className="min-w-0">
            {links
              ? <Link href={f.href} className="font-semibold text-zinc-100 underline-offset-4 hover:text-amber-200 hover:underline">{f.title}</Link>
              : <span className="font-semibold text-zinc-100">{f.title}</span>}
            <span className="block text-sm leading-relaxed text-zinc-400">{f.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

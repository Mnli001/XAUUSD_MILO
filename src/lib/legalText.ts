import type { Locale } from "./i18n";

/**
 * The privacy policy and the terms, in both languages. Written to the Law on Personal Data Protection (2021):
 * purpose, the data, who runs it, how long it is kept, who it is shared with, how to withdraw (its 8.2), and the
 * user's rights (its 16). `{name}` is the operator (LEGAL_NAME), `{contact}` how to reach them.
 * A draft: a lawyer should read it before it is relied on.
 */
export type Section = { h: string; p: string[] };
type Doc = Record<Locale, { title: string; lede: string; sections: Section[] }>;

export const PRIVACY: Doc = {
  mn: {
    title: "Нууцлалын бодлого",
    lede: "XAU Analytics таны ямар мэдээллийг, юунд, хэр удаан хадгалдаг, хэнтэй хуваалцдаг, та өөрийн мэдээллээ хэрхэн удирдахыг энд бичив.",
    sections: [
      { h: "Хэн хариуцдаг вэ", p: ["Энэ сайтыг {name} ажиллуулдаг бөгөөд таны хувийн мэдээллийг хариуцна. Холбоо барих: {contact}."] },
      { h: "Бид ямар мэдээлэл цуглуулдаг вэ", p: [
        "Бүртгэл: нэр, имэйл, нууц үг (зөвхөн задрахгүй хэлбэрээр, hash), хэл, загвар, цагийн бүс, бүртгүүлсэн болон зөвшөөрсөн огноо.",
        "Багц, төлбөр: сонгосон багц, дүн, төлбөрийн төлөв, эрх дуусах хугацаа, төлбөрийн системийн гүйлгээний дугаар. Таны карт, дансны дугаарыг бид хэзээ ч хүлээн авахгүй, хадгалахгүй: төлбөрийг Wire (wire.mn) төлбөрийн систем өөрөө хүлээн авна.",
        "Telegram: хэрэв та холбовол Telegram-ын чатын дугаар, дохионы тохиргоо.",
        "Урилга: таны урилгын код, таныг урьсан хэрэглэгч, урилгаар өгсөн хоног.",
        "Журнал: таны өөрөө бичсэн арилжаа, тэмдэглэл, хавсаргасан зураг.",
        "Бот: хэрэв та MT5 роботыг холбовол дансны дугаар (login), брокерийн серверийн нэр, үлдэгдэл, equity, нээлттэй позиц, хаагдсан арилжааны түүх, роботын тохиргоо.",
        "Техникийн: нэвтрэлтийг хадгалах cookie, сайтын алдааны бүртгэл.",
      ] },
      { h: "Юунд ашигладаг вэ", p: [
        "Танд үйлчилгээ үзүүлэх: нэвтрүүлэх, багцын эрх нээх, төлбөр баталгаажуулах, Telegram дохио болон сануулга илгээх, журнал, ботыг ажиллуулах.",
        "Аюулгүй байдал, алдаа засах, хуульд заасан үүргээ биелүүлэх (жишээ нь нягтлан бодох бүртгэл).",
        "Бид таны мэдээллийг зар сурталчилгаанд ашиглахгүй, худалдахгүй, нийтэд нээлттэй болгохгүй.",
      ] },
      { h: "Хэнтэй хуваалцдаг вэ", p: [
        "Зөвхөн үйлчилгээ ажиллахад зайлшгүй байгаа гуравдагч этгээдтэй: сайтыг байршуулдаг үүлэн сервер (Railway), төлбөрийн систем Wire (Билдрай Эй Ай ХХК), таныг холбосон үед Telegram.",
        "Хуульд заасан эрх бүхий байгууллага хуулийн дагуу шаардсан тохиолдолд.",
      ] },
      { h: "Хэр удаан хадгалдаг вэ", p: [
        "Бүртгэлтэй байх хугацаанд. Та бүртгэлээ устгахад нэр, имэйл, Telegram, журнал, ботын бүх мэдээлэл бүрмөсөн устана.",
        "Төлбөрийн бүртгэлийг нягтлан бодох бүртгэлийн хууль тогтоомжид заасан хугацаанд хадгална.",
      ] },
      { h: "Таны эрх", p: [
        "Өөрийн мэдээлэлтэй танилцах, засуулах, устгуулах, хуулбар авах: Тохиргоо хуудаснаас нэр, нууц үгээ солих, журналаа CSV-ээр татах, бүртгэлээ бүрмөсөн устгах боломжтой. Бусад хүсэлтийг {contact} хаягаар.",
        "Зөвшөөрлөө цуцлах: хүссэн үедээ бүртгэлээ устгаж, эсвэл бидэнд хандаж цуцална. Цуцалбал бид үйлчилгээ үзүүлэх боломжгүй болно.",
        "Гомдол гаргах: бидэнд, эсвэл Хүний эрхийн үндэсний комисст.",
      ] },
      { h: "Мэдээллийн аюулгүй байдал", p: ["Холболт HTTPS-ээр шифрлэгдсэн, нууц үг задрахгүй hash хэлбэрээр хадгалагдана, хэрэглэгч бүр зөвхөн өөрийн мэдээллийг харна. Мэдээлэл алдагдсан тохиолдолд нөлөөлөлд өртсөн хэрэглэгчдэд даруй мэдэгдэнэ."] },
      { h: "Өөрчлөлт", p: ["Энэ бодлогыг өөрчилбөл сайтад мэдэгдэж, дахин зөвшөөрөл авна. Хувилбар: {version}."] },
    ],
  },
  en: {
    title: "Privacy policy",
    lede: "What XAU Analytics keeps about you, why, for how long, who it is shared with, and how you control it.",
    sections: [
      { h: "Who is responsible", p: ["This site is run by {name}, who is responsible for your personal data. Contact: {contact}."] },
      { h: "What we collect", p: [
        "Account: name, email, password (only as a one-way hash), language, theme, time zone, and when you registered and gave consent.",
        "Plans and payments: the plan, amount, payment status, when access ends, and the payment system's transaction reference. We never receive or store your card or bank account numbers: payments are taken by the Wire (wire.mn) payment system itself.",
        "Telegram: if you link it, your Telegram chat id and signal settings.",
        "Invites: your invite code, who invited you, and days given through invites.",
        "Journal: the trades, notes and pictures you enter yourself.",
        "Bot: if you connect the MT5 robot, the account number (login), broker server name, balance, equity, open positions, closed trade history and robot settings.",
        "Technical: a cookie that keeps you signed in, and the site's error logs.",
      ] },
      { h: "What we use it for", p: [
        "To provide the service: signing in, opening plan access, confirming payments, sending Telegram signals and reminders, running the journal and the bot.",
        "Security, fixing faults, and duties the law gives us (bookkeeping, for example).",
        "We do not use your data for advertising, sell it, or publish it.",
      ] },
      { h: "Who we share it with", p: [
        "Only third parties the service cannot run without: the cloud host (Railway), the payment system Wire (Buildry AI LLC), and Telegram when you link it.",
        "Authorities with legal power, when the law requires it.",
      ] },
      { h: "How long we keep it", p: [
        "While you have an account. When you delete it, your name, email, Telegram, journal and all bot data are removed for good.",
        "Payment records are kept for as long as bookkeeping law requires.",
      ] },
      { h: "Your rights", p: [
        "See, correct, delete or get a copy of your data: on the Settings page you can change your name and password, export your journal as CSV, and delete your account for good. Anything else: {contact}.",
        "Withdraw consent: at any time, by deleting your account or asking us. Without consent we cannot provide the service.",
        "Complain: to us, or to the National Human Rights Commission of Mongolia.",
      ] },
      { h: "Security", p: ["Connections are encrypted with HTTPS, passwords are stored as a one-way hash, and each user sees only their own data. If data is ever exposed, the affected users are told at once."] },
      { h: "Changes", p: ["If this policy changes we announce it on the site and ask for consent again. Version: {version}."] },
    ],
  },
};

export const TERMS: Doc = {
  mn: {
    title: "Үйлчилгээний нөхцөл",
    lede: "XAU Analytics-ийг ашиглахад таны болон бидний хооронд үйлчлэх нөхцөл.",
    sections: [
      { h: "Үйлчилгээ", p: ["XAU Analytics нь алтны (XAUUSD) ханшийн түүхэн статистик, техник шинжилгээ, setup дохио, мэдээний календарь, арилжааны журнал, өөрийн MT5 дээр ажиллах роботын хэрэгслийг санал болгодог мэдээллийн үйлчилгээ. Үйлчилгээг {name} үзүүлнэ."] },
      { h: "Санхүүгийн зөвлөгөө биш", p: [
        "Сайт дахь бүх тоо, дохио, шинжилгээ нь өнгөрсөн өгөгдөлд суурилсан статистик мэдээлэл бөгөөд хувь хүнд зориулсан санхүүгийн, хөрөнгө оруулалтын, арилжааны зөвлөгөө биш. Өнгөрсөн үр дүн ирээдүйн ашгийг баталгаажуулахгүй.",
        "Алт, CFD, хөшүүрэгтэй арилжаа өндөр эрсдэлтэй: та оруулсан мөнгөнөөсөө бүгдийг нь алдаж болно. Арилжаа хийх эсэх, хэдэн лотоор, ямар брокероор хийх шийдвэрийг та өөрөө гаргаж, эрсдэлийг өөрөө хариуцна.",
      ] },
      { h: "Бүртгэл", p: ["18 нас хүрсэн байх, үнэн мэдээлэл өгөх, нууц үгээ хамгаалах, бүртгэлээ бусдад ашиглуулахгүй байх. Дүрэм зөрчсөн, бусдад хохирол учруулсан бүртгэлийг бид хааж болно."] },
      { h: "Багц ба төлбөр", p: [
        "Plus 1 сар 50,000₮, Pro 6 сар 150,000₮, Max 1 жил 300,000₮. Төлбөр Wire төлбөрийн системээр, төлбөр баталгаажмагц эрх автоматаар нээгдэнэ. Хугацаатай үед дахин төлбөл үлдсэн хугацаан дээр нэмэгдэнэ. Автоматаар сунгагдахгүй.",
        "Эрх нээгдсэний дараа төлбөрийг буцаан олгохгүй. Давхар эсвэл алдаатай гүйлгээ, эсвэл бидний буруугаас үйлчилгээ удаан хугацаанд ажиллаагүй тохиолдолд {contact} хаягаар хандвал шалгаж буцаана.",
        "Үнэ өөрчлөгдвөл аль хэдийн төлсөн хугацаанд нөлөөлөхгүй.",
      ] },
      { h: "Бот ба таны данс", p: ["Робот нь таны өөрийн MT5 терминал дээр, таны дансаар ажиллана. Тохиргоо, лот, асаах, зогсоох шийдвэр таных. Брокер, интернэт, терминалын доголдол, үнийн огцом хөдөлгөөн, slippage-ээс үүдэх алдагдлыг бид хариуцахгүй. Эхлээд демо дансаар туршихыг зөвлөж байна."] },
      { h: "Хариуцлагын хязгаар", p: ["Бид үйлчилгээг тасралтгүй, алдаагүй байлгахыг хичээх боловч баталгаа өгөхгүй. Таны арилжааны ашиг, алдагдлыг бид хариуцахгүй. Бидний хариуцлага ямар ч тохиолдолд таны сүүлийн 12 сард төлсөн дүнгээс хэтрэхгүй."] },
      { h: "Оюуны өмч", p: ["Сайтын дохио, шинжилгээ, код, загварыг зөвхөн хувийн хэрэгцээнд ашиглана. Бусдад зарах, нийтэд түгээх, бөөнөөр хуулахыг хориглоно."] },
      { h: "Өөрчлөлт ба маргаан", p: ["Нөхцөлийг өөрчилбөл сайтад мэдэгдэж, дахин зөвшөөрөл авна. Маргааныг эхлээд харилцан тохиролцож, болохгүй бол Монгол Улсын хууль тогтоомжийн дагуу шийднэ. Хувилбар: {version}."] },
    ],
  },
  en: {
    title: "Terms of service",
    lede: "The terms between you and us for using XAU Analytics.",
    sections: [
      { h: "The service", p: ["XAU Analytics is an information service offering historical statistics on gold (XAUUSD), technical analysis, setup signals, a news calendar, a trade journal and a robot that runs on your own MT5. It is provided by {name}."] },
      { h: "Not financial advice", p: [
        "Every figure, signal and analysis on the site is statistical information based on past data, not personal financial, investment or trading advice. Past results do not guarantee future profit.",
        "Gold, CFDs and leveraged trading are high risk: you can lose all the money you put in. Whether to trade, at what size and with which broker is your decision, and the risk is yours.",
      ] },
      { h: "Your account", p: ["Be 18 or older, give true details, keep your password safe, and do not let others use your account. We may close an account that breaks these rules or harms others."] },
      { h: "Plans and payment", p: [
        "Plus 1 month 50,000₮, Pro 6 months 150,000₮, Max 1 year 300,000₮. Payment is through the Wire payment system, and access opens by itself once it is confirmed. Paying again while a plan runs adds to its end. Plans do not renew automatically.",
        "Payments are not refunded once access has opened. For a duplicate or mistaken payment, or a long outage that was our fault, contact {contact} and we will check and refund.",
        "A price change does not affect time already paid for.",
      ] },
      { h: "The bot and your account", p: ["The robot runs on your own MT5 terminal, with your account. Its settings, lot size, and starting or stopping it are your decisions. We are not responsible for losses from your broker, internet or terminal failing, sharp price moves or slippage. Try it on a demo account first."] },
      { h: "Limits of liability", p: ["We work to keep the service running and correct but give no guarantee. We are not responsible for your trading profits or losses. Our liability is never more than what you paid us in the last 12 months."] },
      { h: "Intellectual property", p: ["Use the site's signals, analysis, code and design for yourself only. Do not resell, publish or copy them in bulk."] },
      { h: "Changes and disputes", p: ["If these terms change we announce it on the site and ask for consent again. Disputes are settled first by agreement, otherwise under the laws of Mongolia. Version: {version}."] },
    ],
  },
};

# XAU Analytics

Алтны (XAUUSD) трейдерүүдэд зориулсан шинжилгээний веб систем: өнөөдрийн чиглэл, давамгай тал, цаг тутмын өсөх/унах магадлал, мэдээний календарь, арилжааны журнал, гүйцэтгэлийн анализ, админ самбар.

> Систем түүхэн статистик дээр суурилсан тооцоо гаргана. Санхүүгийн зөвлөгөө биш.

## Технологи

Next.js (App Router) · TypeScript · Tailwind · PostgreSQL · Drizzle ORM · Auth.js · Lightweight Charts · Vitest

## Локал дээр ажиллуулах

1. PostgreSQL-д `xau` (хөгжүүлэлт), `xau_test` (тест) гэсэн хоёр бааз үүсгэнэ.
2. `.env.example`-г `.env` болгож хуулаад утгуудыг бөглөнө.
3. Суулгах, бааз бэлдэх:

```bash
npm install
npm run db:migrate          # хүснэгтүүд
npm run seed                # ADMIN_EMAIL / ADMIN_PASSWORD-оор админ үүсгэнэ
npm run backfill            # алтны түүхэн лаа (~10 минут, үнэгүй багцын хязгаараас болж удаан)
npm run dev
```

4. Мэдээний календарь татах: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/calendar`
5. Тест: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xau_test npm run db:migrate` (нэг удаа), дараа нь `npm test`

## Орчны хувьсагчид

| Нэр | Тайлбар |
|---|---|
| `DATABASE_URL` | PostgreSQL холболт |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `TWELVEDATA_API_KEY` | twelvedata.com — үнийн дата |
| `FRED_API_KEY` | fred.stlouisfed.org — мэдээний огноо |
| `CRON_SECRET` | cron дуудлагыг хамгаалах нууц үг |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `npm run seed`-д хэрэглэгдэнэ |

## Эхний удаа шалгах зүйлс

- `npm run check-fred` — FRED-ийн release id бүр зөв мэдээг зааж байгаа эсэхийг хэвлэнэ. Буруу байвал `src/lib/data/calendarProvider.ts` дотор засна.
- FOMC-ийн огноо, таамаг/бодит тоог **Админ → Мэдээ** хэсгээс гараар оруулна.

## Railway дээр байршуулах

1. Шинэ project → GitHub repo-г холбоно, PostgreSQL нэмнэ.
2. Web service-д дээрх хувьсагчдыг оруулна (`DATABASE_URL`-г Postgres-оос reference хийнэ). `railway.json` нь build, migration, start-ыг тохируулсан.
3. Deploy болсны дараа нэг удаа: `railway run npm run seed`, `railway run npm run backfill`.
4. Гурван cron service нэмнэ (тус бүр `curl` ажиллуулах жижиг service, `APP_URL` = сайтын хаяг):

| Хуваарь | Команд |
|---|---|
| `*/5 * * * *` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/prices?scope=fast"` |
| `2 * * * *` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/prices?scope=hourly"` |
| `10 0 * * *` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/calendar"` |

Үнэгүй багцын хэрэглээ: өдөрт ойролцоогоор 360 хүсэлт (хязгаар 800).

## Тооцоолол товчхон

- **Давамгай тал:** timeframe бүрт −100…+100 оноо = тренд (EMA20/50/200) + моментум (RSI, MACD) + бүтэц (оргил/ёроол). Жин: өдөр 35%, 4ц 30%, 1ц 20%, 15м 15%. ≥ +20 бол "ӨСӨХ хандлага", ≤ −20 бол "УНАХ хандлага".
- **Цагийн магадлал:** сүүлийн 183 хоногийн 1 цагийн лаа, УБ цагаар. Түүвэр 30-аас цөөн бол хувь гаргахгүй.
- **Мэдээний хариу үйлдэл:** сүүлийн 12 сарын ижил төрлийн мэдээний дараах 15/30/60 минутын хөдөлгөөн. 6-аас цөөн бол гаргахгүй.
- **Журнал:** 1 лот = 100 унц. P&L = (гарсан − орсон) × чиглэл × лот × 100.

## Зарахаас өмнө шийдэх зүйлс

- **Үнийн датаны эрх:** үнэгүй багц хоцролттой бөгөөд арилжааны зорилгоор хэрэглэхэд бизнес багц шаардана. Эх сурвалжийг солихдоо `src/lib/data/priceProvider.ts`-ийн `PriceProvider`-г хэрэгжүүлсэн шинэ адаптер бичихэд хангалттай.
- **Төлбөр:** одоогоор админ гараар эрх нээнэ (Админ → Хэрэглэгчид). QPay-г дараа нэмнэ.

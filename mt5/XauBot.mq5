//+------------------------------------------------------------------+
//| XauBot.mq5 — XAU Analytics-ийн вэб самбараас удирддаг робот      |
//| Арилжааг энэ робот брокерын бодит цагийн үнээр өөрөө хийнэ.      |
//| Вэб самбар: тохиргоо, Start/Stop, хяналт.                        |
//| АНХААР: Scalper арга шалгагдаагүй. Ашиг баталгаагүй.             |
//+------------------------------------------------------------------+
#property copyright "XAU Analytics"
#property version   "3.91"
#property description "Web-controlled robot: scalper, basket and Asian breakout, each behind an entry filter (trend, session, news, volatility, spread, daily limits). Unproven. Demo by default; real accounts need AllowRealAccount AND the switch on the web."

#include <Trade\Trade.mqh>

input string ServerUrl            = "https://web-production-4f0081ec.up.railway.app/api/bot/sync"; // Вэб самбар дээрх хаяг · Web address
input string BotToken             = "";       // Вэб дээр үүсгэсэн токен · Token from the web
input bool   AllowRealAccount     = false;    // Жинхэнэ данс зөвшөөрөх · Allow a real account
input long   MagicNumber          = 20261121; // Роботын арилжааг ялгах дугаар · Magic number
input int    SyncSeconds          = 1;        // Вэбтэй холбогдох давтамж (сек) · Sync every (s)
input int    EntryCooldownSeconds = 5;        // Хоёр арилжааны хоорондох зай (сек) · Gap between entries (s)
input int    MaxSpreadPoints      = 600;      // Spread үүнээс их бол орохгүй (point) · No entry above this spread
input bool   ShareJournal         = true;     // Дансны хаасан бүх арилжааг вэбийн журналд илгээх · Send closed trades to the web journal
enum ENUM_XAU_LANG
  {
   LANG_WEB = 0, // Вэбийн тохиргоог дагах · Follow the web setting
   LANG_MN  = 1, // Монгол
   LANG_EN  = 2  // English
  };
input ENUM_XAU_LANG Language      = LANG_WEB; // Хэл · Language

// Strategy Tester дотор вэбтэй холбогдох боломжгүй тул тохиргоог эндээс авна.
// Нэг ажиллагаа дуусмагц TesterRestartSeconds-ийн дараа дахин "Start" дарсантай адил шинээр эхэлнэ.
enum ENUM_XAU_TOOL
  {
   TOOL_SCALPER  = 0, // Scalper
   TOOL_BASKET   = 1, // Багц · Basket
   TOOL_ASIAN    = 2, // Дүрэм 1 · Rule 1: Asian range breakout + daily & 4h trend, 3R
   TOOL_LONDON   = 3, // Дүрэм 2 · Rule 2: London open first-hour breakout
   TOOL_PULLBACK = 4, // Дүрэм 3 · Rule 3: 1-hour pullback with the daily trend
   TOOL_FADE     = 5, // Дүрэм 4 · Rule 4: fading an overstretched price (1h)
   TOOL_ICT      = 6, // ICT/SMC: sweep, MSS, FVG, OTE
   TOOL_SMCX     = 7, // SMC Active: breakout, QM, nearest liquidity
   TOOL_STRADDLE = 8  // Straddle (BuySellStop Pro v5)
  };
input group "Strategy Tester (зөвхөн backtest-д · backtest only)"
input ENUM_XAU_TOOL TesterTool    = TOOL_SCALPER; // Хэрэгсэл · Tool
input double TesterLots           = 0.01;     // Лот (арилжаа бүрт) · Lots per trade
input int    TesterCount          = 3;        // Зэрэг нээх арилжааны тоо · Trades at once
input double TesterSlAtr          = 1.5;      // Scalper: stop loss (ATR x)
input double TesterTpAtr          = 2.0;      // Scalper: take profit (ATR x)
input double TesterProfit         = 0.0;      // Нийт ашиг $ хүрвэл хаах · Close at total profit $
input double TesterLoss           = 0.0;      // Нийт алдагдал $ хүрвэл хаах · Close at total loss $
input int    TesterIctVariant     = 1;        // ICT / SMC Active хувилбар 1-8 · variant 1-8
input bool   TesterManage         = false;    // SMC Active: BE + trailing (BuySellStop Pro v5) · BE + trailing
input int    TesterRestartSeconds = 60;       // Дахин эхлэх хүртэлх зай (сек) · Restart after (s)
input int    ServerUtcOffsetWinter = 2;       // Серверийн цаг UTC-ээс түрүүлэх цаг (өвөл) · Server hours ahead of UTC (winter)
input bool   ServerDstEurope      = true;     // Сервер Европын зуны цаг мөрддөг · Server follows EU summer time
input bool   ServerUtcAuto        = true;     // Live: серверийн цагийн бүсийг өөрөө тодорхойлох · Live: detect the server clock itself
// Орох шүүлтүүр: бодит цагт вэбийн тохиргоог дагана, tester дотор эндээс авна. Мэдээний шүүлтүүр tester дотор ажиллахгүй (мэдээний цаг вэбээс ирдэг).
input group "Орох шүүлтүүр, tester · Entry filter, tester"
input bool   TesterGate           = true;     // Шүүлтүүр асаах (false: v2.70-ийн дүрмээр) · Filter on (false = as in v2.70)
input bool   TesterGateTrend      = true;     // H1 + M15 EMA20/50 чиглэл таарах · H1 + M15 trend must agree
input int    TesterSessionStartUb = 15;       // Арилжаа эхлэх цаг (УБ) · First hour traded (UB)
input int    TesterSessionEndUb   = 1;        // Арилжаа дуусах цаг (УБ, орохгүй) · First hour not traded (UB)
input double TesterAtrMin         = 1.5;      // M15 ATR доод $ (0 = үгүй) · Min M15 ATR $ (0 = off)
input double TesterAtrMax         = 25.0;     // M15 ATR дээд $ (0 = үгүй) · Max M15 ATR $ (0 = off)
input double TesterSpreadPct      = 10.0;     // Spread нь M15 ATR-ийн %-аас ихгүй · Max spread, % of M15 ATR
input double TesterRsiMax         = 70.0;     // BUY: RSI(14,M15) дээд; SELL: 100-аас хасна (0 = үгүй) · RSI cap (0 = off)
input double TesterExtAtr         = 2.0;      // EMA20(M15)-оос ATR × -аас хол бол орохгүй (0 = үгүй) · Max stretch from EMA20, ATR x
input int    TesterMaxTradesDay   = 6;        // Өдөрт орох дээд тоо (0 = үгүй) · Max entries a day (0 = off)
input int    TesterRiskMode       = 0;        // Хэмжээ: 0 = TesterLots, 1 = арилжаа бүрт $, 2 = балансын % · Size: 0 lots, 1 $ per trade, 2 % of balance
input double TesterRiskValue      = 2.0;      // Эрсдэл ($ эсвэл %) · Risk ($ or %)
input bool   TesterH1Stops        = false;    // Stop = H1 ATR x 1.5, target = stop x 2 (Scalper) · Stops from the 1-hour ATR
input bool   TesterWeekly         = false;
input int    TesterMaxOpen        = 3;        // Setup: нэг дор нээлттэй байх дээд арилжаа · Most trades open at once    // Setup: долоо хоногийн тренд ч нэг чиглэлд байх · Weekly trend must agree too
input bool   TesterProtect        = false;    // +1R-д stop-ийг орсон үнэ рүү, +1.5R-ээс дагуулах · Break-even at +1R, trail from +1.5R
input double TesterDailyLossPct   = 3.0;      // Өдрийн алдагдал балансын % хүрвэл зогсох (0 = үгүй) · Daily loss stop, % of balance

CTrade trade;
int    hEmaFast = INVALID_HANDLE, hEmaSlow = INVALID_HANDLE, hEmaTrend = INVALID_HANDLE, hRsi = INVALID_HANDLE, hAtr = INVALID_HANDLE;

// серверээс ирсэн тушаал
string gState = "STOPPED";
string gRunId = "";
double gLots = 0.01, gSlAtr = 1.5, gTpAtr = 2.0, gTarget = 0.0, gMaxLoss = 0.0;
int    gMaxPos = 1;
bool   gCloseAll = false;
long   gDId = 0, gDLast = -1;      // вэбээс ирсэн захиалга (DAY, ASIAN): dId 0 = одоо юу ч байхгүй
int    gDDir = 0, gDAge = 99999;
double gDRisk = 0.0, gDRR = 2.0;
long   gDExit = 0;               // вэбээс ирсэн захиалгын хаах цаг (UTC unix секунд), 0 = дүрмийн өөрийнх
// v3.70: сешн бүрийн идэвхтэй захиалга "id,dir,entry,sl,tp,ageSec,exitAt;..." (id = дүрмийн дугаар × 1e10 + лааны хаалт)
// Session orders from the web (v3.70+): every live setup, with absolute stop and target prices.
string gOrders = "";
bool   gHasOrders = false;         // сервер orders талбар илгээдэг (хуучин сервер: зөвхөн dId…dExit)
int    gOMaxAge = 1800;            // захиалга лаа хаагдсанаас хойш хэдэн секунд хүчинтэй (Telegram-тай ижил дүрэм)
double gOSlipR = 0.3;              // үнэ орох түвшнээс эрсдэлийн энэ хэсгээс илүү target руу явсан бол орохгүй
datetime gOrderTryAt = 0;          // сүүлд захиалга илгээсэн цаг: брокерын хариу хоцорвол давхар илгээхгүй
string gMode = "SCALPER";          // SCALPER: нэг нэгээр орно · BASKET: бүгдийг зэрэг нээж, нийт дүнгээр зэрэг хаана

#define ROBOT_VERSION 16             // вэб энэ дугаараар роботын файл шинэ эсэхийг мэднэ (6: орох шүүлтүүр, 14: сешн бүрийн захиалга, SL/TP үнээр, 15: trend-ийн хэмжээ, 16: журнал)
// v3.90: вэбийн журнал. Сервер jFrom (UTC unix секунд) илгээнэ: тэр цагаас хойш хаагдсан арилжааг 50-иар илгээнэ.
long     gJFrom = 0;               // 0 = сервер журнал асуугаагүй (хуучин сервер)
datetime gJournalAt = 0;           // сүүлд журнал илгээсэн цаг (компьютерийн): 30 секунд тутамд л түүх уншина

// Орох шүүлтүүр (бүх хэрэгсэл арилжаа нээхээс өмнө давах ёстой). Вэбээс эсвэл Tester… input-аас.
bool     gGateOn = true, gGTrend = true;
int      gGStart = 15, gGEnd = 1, gGMaxTrades = 6;
double   gGAtrMin = 1.5, gGAtrMax = 25.0, gGSpreadPct = 10.0, gGRsiMax = 70.0, gGExtAtr = 2.0, gGDailyLossPct = 3.0;
// Вэбийн олон аргын дүгнэлт: орох чиглэлийг дор хаяж gCMin арга дэмжсэн үед л орно (0 = шалгахгүй)
int      gCMin = 0, gCBuy = 0, gCSell = 0, gCTotal = 0;
// Хэмжээ ба stop: вэбээс. gRiskMode 0 = лот, 1 = $, 2 = балансын %. gStopMode 1 = вэбийн шинжилгээний H1 ATR-аас.
int      gRiskMode = 0, gStopMode = 0;
bool     gProtect = false;         // ашигтай арилжааг хамгаалах: +1R дээр stop-ийг орсон үнэ рүү, +1.5R-ээс дагуулна
double   gRiskVal = 0.0, gSiteAtr = 0.0, gSiteStopMult = 1.5, gSiteRR = 2.0;
string   gBlackouts = "";          // "from-to;from-to" UTC unix секунд, вэбээс (HIGH мэдээний өмнө/дараа)
string   gBlock = "";              // шүүлтүүр хаасан шалтгааны код, "" = нэвтэрнэ
string   gBlockDetail = "";        // тоон дэлгэрэнгүй (хэлнээс хамаарахгүй)
int      hGH1Fast = INVALID_HANDLE, hGH1Slow = INVALID_HANDLE, hGM15Fast = INVALID_HANDLE, hGM15Slow = INVALID_HANDLE, hGM15Rsi = INVALID_HANDLE, hGM15Atr = INVALID_HANDLE;
datetime gStatsAt = 0;             // өдрийн тоололын кэш (секундэд нэг удаа)
int      gTradesToday = 0;
double   gDayPnl = 0.0, gDayStartBalance = 0.0;
bool     gDailyLossHit = false;

// роботын өөрийн төлөв
string   gActiveRunId = "";
datetime gRunStart = 0;
string   gFinished = "";
string   gSignal = "NONE";
string   gReason = "";
datetime gLastEntry = 0;
datetime gLastSyncOk = 0;
datetime gFirstEntry = 0;          // энэ удаагийн анхны арилжаа
string   gRunSide = "";            // энэ удаа ямар чиглэлд ажиллаж байгаа
int      gPlannedSeconds = 0;      // ботын өөрөө тооцсон ажиллах хугацаа

#define WAIT_FOR_SIGNAL_SECONDS 1800 // 30 минутад дохио гарахгүй бол зогсоно
string   gLinkStatus = "";          // хоосон бол "холбогдоогүй" гэж харуулна
string   gLang = "mn";              // чартын бичвэрийн хэл: вэбийн тохиргооноос эсвэл Language-ээс
bool     gTester = false;          // Strategy Tester дотор ажиллаж байна
datetime gTesterStoppedAt = 0;
int      gTesterRuns = 0;
bool     gClosing = false;

// Дүрэм 1-4-ийн төлөв (зөвхөн Strategy Tester)
int      hD1Fast = INVALID_HANDLE, hD1Slow = INVALID_HANDLE, hH1Ema20 = INVALID_HANDLE, hH1Ema50 = INVALID_HANDLE, hH1Rsi = INVALID_HANDLE, hH1Atr = INVALID_HANDLE;
datetime gRuleLastBar = 0;         // сүүлд шалгасан M15 лаа
int      gRuleDay = -1;            // UTC өдөр
bool     gRuleTraded = false;      // өнөөдөр орсон эсэх
double   gRangeHigh = 0.0, gRangeLow = 0.0;
int      gRangeBars = 0;
datetime gRuleExitAt = 0;          // нээлттэй арилжааг энэ цагт хаана         // хаах тушаал өгсөн ч арилжаа үлдсэн бол дахин оролдоно
// SMC Active хэрэгсэл (tester)
int      hM15Atr = INVALID_HANDLE;
datetime gSxLastBar = 0;
int      gSxDay = -1;
bool     gSxLevels = false;
double   gSxDayHi = 0, gSxDayLo = 0, gSxPostHi = 0, gSxPostLo = 0;
datetime gSxBosUp = 0, gSxBosDn = 0, gSxQmUp = 0, gSxQmDn = 0;   // нэг swing-ээр нэг л удаа орно
datetime gStPlaced = 0;                     // Straddle: хос захиалга тавьсан цаг
// ICT / SMC хэрэгсэл (tester)
int      hM5Atr = INVALID_HANDLE;
datetime gIctLastBar = 0;
int      gIctDay = -1;
datetime gIctDayStart = 0;                 // UTC 00:00, серверийн цагаар
bool     gIctLevels = false, gIctAsia = false;
double   gPdh = 0, gPdl = 0, gVah = 0, gVal = 0, gAsiaH = 0, gAsiaL = 0;
bool     gPdhTaken = false, gPdlTaken = false, gAsiaHTaken = false, gAsiaLTaken = false;
bool     gKzUsed[2];
int      gSetDir = 0;                      // +1: доод liquidity авагдаж BUY хайна, -1: SELL
datetime gSweepTime = 0;
double   gSweepExt = 0;                    // sweep-ийн оргил (BUY-д хамгийн нам үнэ)
double   gLegExt = 0;                      // түүнээс хойших эсрэг оргил (импульсийн төгсгөл)
double   gMssLevel = 0;
bool     gMss = false;
ulong    gIctOrder = 0;
datetime gIctOrderEnd = 0;
double   gIctOrderTp = 0;
int      gIctOrderDir = 0;
datetime gH4BiasBar = 0;
int      gH4Bias = 0;


//+------------------------------------------------------------------+
// Чартын бичвэр хоёр хэлээр: L("монгол", "english")
string L(const string mn, const string en) { return((gLang == "en") ? en : mn); }
string LinkText() { return((gLinkStatus == "") ? L("холбогдоогүй", "not connected") : gLinkStatus); }

// Бямба, ням гарагт алтны үнэ нэг цагаас удаан ирээгүй бол зах хаалттай. Зөвхөн чартын бичвэрт хэрэглэнэ.
bool WeekendQuiet()
  {
   if(gTester) return(false);
   MqlDateTime g;
   TimeToStruct(TimeGMT(), g);
   if(g.day_of_week != 6 && g.day_of_week != 0) return(false);
   return(TimeTradeServer() - (datetime)SymbolInfoInteger(_Symbol, SYMBOL_TIME) > 3600);
  }

int OnInit()
  {
   gLang = (Language == LANG_EN) ? "en" : "mn";              // LANG_WEB: вэбээс хариу иртэл монгол
   hEmaFast  = iMA(_Symbol, PERIOD_M1, 9, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow  = iMA(_Symbol, PERIOD_M1, 21, 0, MODE_EMA, PRICE_CLOSE);
   hEmaTrend = iMA(_Symbol, PERIOD_M5, 50, 0, MODE_EMA, PRICE_CLOSE);
   hRsi      = iRSI(_Symbol, PERIOD_M1, 7, PRICE_CLOSE);
   hAtr      = iATR(_Symbol, PERIOD_M1, 14);
   hH1Atr    = iATR(_Symbol, PERIOD_H1, 14);
   hD1Fast   = iMA(_Symbol, PERIOD_D1, 20, 0, MODE_EMA, PRICE_CLOSE);   // Азийн breakout-ын өдрийн тренд
   hD1Slow   = iMA(_Symbol, PERIOD_D1, 50, 0, MODE_EMA, PRICE_CLOSE);
   hGH1Fast  = iMA(_Symbol, PERIOD_H1, 20, 0, MODE_EMA, PRICE_CLOSE);  // шүүлтүүр: дээд хугацааны тренд
   hGH1Slow  = iMA(_Symbol, PERIOD_H1, 50, 0, MODE_EMA, PRICE_CLOSE);
   hGM15Fast = iMA(_Symbol, PERIOD_M15, 20, 0, MODE_EMA, PRICE_CLOSE);
   hGM15Slow = iMA(_Symbol, PERIOD_M15, 50, 0, MODE_EMA, PRICE_CLOSE);
   hGM15Rsi  = iRSI(_Symbol, PERIOD_M15, 14, PRICE_CLOSE);
   hGM15Atr  = iATR(_Symbol, PERIOD_M15, 14);
   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hEmaTrend == INVALID_HANDLE || hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hD1Fast == INVALID_HANDLE || hD1Slow == INVALID_HANDLE ||
      hGH1Fast == INVALID_HANDLE || hGH1Slow == INVALID_HANDLE || hGM15Fast == INVALID_HANDLE || hGM15Slow == INVALID_HANDLE || hGM15Rsi == INVALID_HANDLE || hGM15Atr == INVALID_HANDLE)
     {
      Print(L("XauBot: индикатор үүсгэж чадсангүй", "XauBot: could not create the indicators"));
      return(INIT_FAILED);
     }
   if(StringLen(BotToken) == 0 && !MQLInfoInteger(MQL_TESTER))
      Print(L("XauBot: BotToken хоосон байна — вэб самбар дээр токен үүсгээд энд оруулна уу", "XauBot: BotToken is empty — create a token on the web panel and enter it here"));
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFillingBySymbol(_Symbol);
   gTester = (bool)MQLInfoInteger(MQL_TESTER);
   if(gTester)
     {
      gMode    = (TesterTool == TOOL_BASKET) ? "BASKET" : "SCALPER";
      gLots    = TesterLots;
      gMaxPos  = MathMax(1, TesterCount);
      gSlAtr   = TesterSlAtr;
      gTpAtr   = TesterTpAtr;
      gTarget  = TesterProfit;
      gMaxLoss = TesterLoss;
      gLinkStatus = "Strategy Tester";
      gGateOn  = TesterGate;
      gGTrend  = TesterGateTrend;
      gGStart  = TesterSessionStartUb;
      gGEnd    = TesterSessionEndUb;
      gGAtrMin = TesterAtrMin;
      gGAtrMax = TesterAtrMax;
      gGSpreadPct = TesterSpreadPct;
      gGRsiMax = TesterRsiMax;
      gGExtAtr = TesterExtAtr;
      gGMaxTrades = TesterMaxTradesDay;
      gGDailyLossPct = TesterDailyLossPct;
      gCMin = 0;                                                   // Tester дотор вэбийн дүгнэлт байхгүй
      gRiskMode = (int)MathMax(0, MathMin(2, TesterRiskMode));
      gRiskVal  = MathMax(0.0, TesterRiskValue);
      gStopMode = TesterH1Stops ? 1 : 0;
      gProtect  = TesterProtect;
      if(gGStart < 0 || gGStart > 23 || gGEnd < 0 || gGEnd > 23 || gGAtrMin < 0 || gGAtrMax < 0 || (gGAtrMax > 0 && gGAtrMin >= gGAtrMax) ||
         gGSpreadPct < 0 || gGRsiMax < 0 || gGRsiMax > 100 || gGExtAtr < 0 || gGMaxTrades < 0 || gGDailyLossPct < 0)
        {
         Print(L("XauBot: орох шүүлтүүрийн Tester… утга буруу", "XauBot: an entry filter Tester… value is out of range"));
         return(INIT_PARAMETERS_INCORRECT);
        }
      if(TesterTool >= TOOL_ASIAN)
        {
         hH1Ema20 = iMA(_Symbol, PERIOD_H1, 20, 0, MODE_EMA, PRICE_CLOSE);
         hH1Ema50 = iMA(_Symbol, PERIOD_H1, 50, 0, MODE_EMA, PRICE_CLOSE);
         hH1Rsi   = iRSI(_Symbol, PERIOD_H1, 14, PRICE_CLOSE);
         hH1Atr   = iATR(_Symbol, PERIOD_H1, 14);
         if(TesterTool == TOOL_SMCX)
           {
            if(TesterIctVariant < 1 || TesterIctVariant > 8) return(INIT_PARAMETERS_INCORRECT);
            hM5Atr  = iATR(_Symbol, PERIOD_M5, 14);
            hM15Atr = iATR(_Symbol, PERIOD_M15, 14);
            if(hM5Atr == INVALID_HANDLE || hM15Atr == INVALID_HANDLE) return(INIT_FAILED);
           }
         if(TesterTool == TOOL_ICT)
           {
            if(TesterIctVariant < 1 || TesterIctVariant > 8) return(INIT_PARAMETERS_INCORRECT);
            hM5Atr = iATR(_Symbol, PERIOD_M5, 14);
            if(hM5Atr == INVALID_HANDLE) return(INIT_FAILED);
           }
         if(hD1Fast == INVALID_HANDLE || hD1Slow == INVALID_HANDLE || hH1Ema20 == INVALID_HANDLE || hH1Ema50 == INVALID_HANDLE || hH1Rsi == INVALID_HANDLE || hH1Atr == INVALID_HANDLE)
            return(INIT_FAILED);
         gMode = "RULE";
         EventSetTimer(MathMax(1, SyncSeconds));
         return(INIT_SUCCEEDED);
        }
      if(gMode == "BASKET" && (gTarget <= 0 || gMaxLoss <= 0))
        {
         Print(L("XauBot: Багцыг турших бол TesterProfit, TesterLoss хоёуланг 0-ээс их тавина", "XauBot: to test the Basket set both TesterProfit and TesterLoss above 0"));
         return(INIT_PARAMETERS_INCORRECT);
        }
      BeginRun("tester-1");
      gState = "RUNNING";
     }
   EventSetTimer(MathMax(1, SyncSeconds));
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(hEmaFast  != INVALID_HANDLE) IndicatorRelease(hEmaFast);
   if(hEmaSlow  != INVALID_HANDLE) IndicatorRelease(hEmaSlow);
   if(hEmaTrend != INVALID_HANDLE) IndicatorRelease(hEmaTrend);
   if(hRsi      != INVALID_HANDLE) IndicatorRelease(hRsi);
   if(hAtr      != INVALID_HANDLE) IndicatorRelease(hAtr);
   if(hD1Fast   != INVALID_HANDLE) IndicatorRelease(hD1Fast);
   if(hD1Slow   != INVALID_HANDLE) IndicatorRelease(hD1Slow);
   if(hH1Ema20  != INVALID_HANDLE) IndicatorRelease(hH1Ema20);
   if(hH1Ema50  != INVALID_HANDLE) IndicatorRelease(hH1Ema50);
   if(hH1Rsi    != INVALID_HANDLE) IndicatorRelease(hH1Rsi);
   if(hH1Atr    != INVALID_HANDLE) IndicatorRelease(hH1Atr);
   if(hM5Atr    != INVALID_HANDLE) IndicatorRelease(hM5Atr);
   if(hM15Atr   != INVALID_HANDLE) IndicatorRelease(hM15Atr);
   if(hGH1Fast  != INVALID_HANDLE) IndicatorRelease(hGH1Fast);
   if(hGH1Slow  != INVALID_HANDLE) IndicatorRelease(hGH1Slow);
   if(hGM15Fast != INVALID_HANDLE) IndicatorRelease(hGM15Fast);
   if(hGM15Slow != INVALID_HANDLE) IndicatorRelease(hGM15Slow);
   if(hGM15Rsi  != INVALID_HANDLE) IndicatorRelease(hGM15Rsi);
   if(hGM15Atr  != INVALID_HANDLE) IndicatorRelease(hGM15Atr);
   Comment("");
  }

// Нэг удаагийн хаалт амжилтгүй болж арилжаа үлдвэл дуустал нь дахин хаана.
void RetryClose()
  {
   if(!gClosing) return;
   if(CountPositions() + CountOrders() == 0) { gClosing = false; return; }
   CloseAllMine();
  }

// Шинэ ажиллагаа: тоолуур, чиглэл, хугацааг эхнээс нь
void BeginRun(const string runId)
  {
   gActiveRunId = runId;
   gRunStart = TimeCurrent();
   gFinished = "";
   gClosing = false;
   gLastEntry = 0;
   gFirstEntry = 0;
   gRunSide = "";
   gPlannedSeconds = 0;
   gRuleLastBar = 0;                                             // Азийн breakout-ын төлөвийг шинээр уншина
  }

// Strategy Tester: дууссан ажиллагааг хааж, хэсэг хүлээгээд дахин эхлүүлнэ
void TesterStep()
  {
   if(!gTester) return;
   if(gState == "RUNNING")
     {
      if(gFinished != "" && CountPositions() == 0)
        {
         gState = "STOPPED";
         gFinished = "";
         gTesterStoppedAt = TimeCurrent();
         gTesterRuns++;
        }
      return;
     }
   if(TimeCurrent() - gTesterStoppedAt >= TesterRestartSeconds)
     {
      BeginRun("tester-" + (string)(gTesterRuns + 1));
      gState = "RUNNING";
     }
  }

void OnTimer()
  {
   if(IsRuleTool()) return;
   AsianTimeExit();                                              // дүрмийн арилжаа хэрэгслээс үл хамааран өөрийн цагтаа хаагдана
   RetryClose();
   if(gMode != "ASIAN") DailyGuard();                            // Азийн (setup) хэрэгсэлд шүүлтүүр, өдрийн хязгаар үйлчлэхгүй
   if(gMode == "ASIAN")
      LiveAsianStep();
   else if(gMode == "READING")
      ReadingStep();
   else if(gMode == "DAY")
      DayStep();
   else
     {
      EvaluateSignal();
      ManageRun();
     }
   if(gMode == "ASIAN") { gBlock = ""; gBlockDetail = ""; }      // сайтын дүрмийг яг тэр чигээр нь: шүүлтүүргүй
   else GateCheck(SignalDir());                                  // самбарт "яагаад орохгүй байна" гэдгийг үргэлж шинэчилнэ
   
   // Оновчлол: Ботыг зогсоосон бөгөөд арилжаагүй сул зогсох үед 3 сек тутамд, идэвхтэй үед тогтмол sync хийнэ
   static int idleCounter = 0;
   bool isIdle = (gState == "STOPPED" && CountPositions() == 0 && CountOrders() == 0);
   if(isIdle)
     {
      idleCounter++;
      if(idleCounter >= 3)
        {
         Sync();
         idleCounter = 0;
        }
     }
   else
     {
      idleCounter = 0;
      Sync();
     }

   ShowStatus();
  }

void OnTick()
  {
   if(IsRuleTool()) { RetryClose(); DailyGuard(); RuleStep(); return; }
   AsianTimeExit();                                              // хэрэгсэл солигдсон ч дүрмийн арилжаа цагтаа хаагдана
   if(gMode == "ASIAN") { RetryClose(); LiveAsianStep(); return; }   // зөвхөн сайтын дүрэм: шүүлтүүр, хамгаалалт, өдрийн хязгааргүй
   if(gMode == "READING") { RetryClose(); DailyGuard(); ProtectAll(); ReadingStep(); return; }
   if(gMode == "DAY") { RetryClose(); DailyGuard(); ProtectAll(); DayStep(); return; }
   TesterStep();
   RetryClose();
   DailyGuard();
   EvaluateSignal();
   ProtectAll();
   ManageRun();
   TryEnter();
  }

//+------------------------------------------------------------------+
//| Туслах функцууд                                                  |
//+------------------------------------------------------------------+
double Buf(const int handle, const int shift)
  {
   double b[];
   if(CopyBuffer(handle, 0, shift, 1, b) != 1)
      return(EMPTY_VALUE);
   return(b[0]);
  }

string AccountModeStr()
  {
   ENUM_ACCOUNT_TRADE_MODE m = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(m == ACCOUNT_TRADE_MODE_DEMO)    return("DEMO");
   if(m == ACCOUNT_TRADE_MODE_CONTEST) return("CONTEST");
   return("REAL");
  }

bool IsMine(const ulong ticket)
  {
   if(!PositionSelectByTicket(ticket)) return(false);
   return(PositionGetInteger(POSITION_MAGIC) == MagicNumber && PositionGetString(POSITION_SYMBOL) == _Symbol);
  }

int CountPositions()
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(IsMine(PositionGetTicket(i))) n++;
   return(n);
  }

// Setup дүрмийн (comment "xau-r:") нээлттэй позиц энэ чиглэлд байгаа эсэх. Байвал шинэ арилжаа хагас лотоор нээгдэнэ:
// нэг чиглэлийн арилжаанууд хамт хөдөлдөг (r = 0.64) тул эрсдэл давхардахгүй (scripts/exposure-cap-research.ts).
bool SameDirOpen(const int dir)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(!IsMine(t)) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "xau-r:") != 0) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if((dir > 0 && type == POSITION_TYPE_BUY) || (dir < 0 && type == POSITION_TYPE_SELL)) return(true);
     }
   return(false);
  }
#define SAME_DIR_MUL 0.5

// Нийт нээлттэй лот. Netting дансанд олон захиалга нэг позиц болж нийлдэг тул
// арилжааны тоогоор биш, лотын нийлбэрээр хязгаарлана.
double TotalVolume()
  {
   double v = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(IsMine(PositionGetTicket(i)))
         v += PositionGetDouble(POSITION_VOLUME);
   return(v);
  }

double FloatingPnl()
  {
   double p = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(IsMine(PositionGetTicket(i)))
         p += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   return(p);
  }

// Энэ удаагийн ажиллагааны хаагдсан арилжааны нийт дүн (шимтгэл, swap орсон)
double ClosedPnlSince(const datetime from)
  {
   double p = 0.0;
   if(from <= 0 || !HistorySelect(from, TimeCurrent() + 60)) return(0.0);
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber) continue;
      if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
      p += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION);
     }
   return(p);
  }

double RunPnl()
  {
   if(gRunStart <= 0) return(0.0);
   return(ClosedPnlSince(gRunStart) + FloatingPnl());
  }

// Нээлттэй арилжааг хааж, хүлээгдэж буй захиалгыг цуцална. Амжилтгүй бол RetryClose дахин оролдоно.
void CloseAllMine()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(IsMine(t))
         if(!trade.PositionClose(t) || !TradeOk())
            Print(L("XauBot: арилжаа хааж чадсангүй #", "XauBot: could not close trade #"), (string)t, " — ", trade.ResultRetcodeDescription());
     }
   DeleteMyOrders();
  }

bool RealBlocked()
  {
   return(AccountModeStr() == "REAL" && !AllowRealAccount);
  }

//+------------------------------------------------------------------+
//| Захиалгын туслахууд: брокерын хариу, tick, stops level, лот       |
//+------------------------------------------------------------------+
// OrderSend true буцаасан нь биелсэн гэсэн үг биш: брокерын хариу кодыг шалгана.
bool TradeOk()
  {
   uint rc = trade.ResultRetcode();
   return(rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED);
  }

double TickSize()
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   return(ts > 0 ? ts : _Point);
  }
double PriceDown(const double p) { double ts = TickSize(); return(NormalizeDouble(MathFloor(p / ts + 1e-7) * ts, _Digits)); }
double PriceUp(const double p)   { double ts = TickSize(); return(NormalizeDouble(MathCeil(p / ts - 1e-7) * ts, _Digits)); }
double PriceNear(const double p) { double ts = TickSize(); return(NormalizeDouble(MathRound(p / ts) * ts, _Digits)); }

// Брокерын stops level ба freeze level-ээс нэг point илүү
double StopsMin()
  {
   long lv = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL), fz = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   if(fz > lv) lv = fz;
   return((double)(lv + 1) * _Point);
  }

int SpreadPoints()
  {
   return((int)MathRound((SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID)) / _Point));
  }

// Лотыг брокерын алхам, доод, дээд хэмжээнд тааруулна. Доод хэмжээнээс бага бол 0.
double NormLots(const double want)
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   int digits = (int)MathMax(0.0, MathCeil(-MathLog10(step) - 1e-9));
   double lots = MathFloor(want / step + 1e-9) * step;
   if(vmax > 0 && lots > vmax) lots = MathFloor(vmax / step + 1e-9) * step;
   lots = NormalizeDouble(lots, digits);
   if(lots <= 0 || lots < vmin - 1e-9) return(0.0);
   return(lots);
  }

// Зах зээлийн захиалга. Stop/target-ийг tick-д тааруулж, stops level-ээс ойр бол түүнд хүртэл холдуулна:
// BUY-ийн stop, target-ийг Bid-ээс, SELL-ийнхийг Ask-аас хэмждэг. Үнэ хөдөлсөн (requote) бол нэг дахин оролдоно.
bool SendMarket(const int dir, const double lots, const double slDist, const double tpDist, const string cm)
  {
   if(lots <= 0 || dir == 0) return(false);
   for(int attempt = 0; attempt < 2; attempt++)
     {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(ask <= 0 || bid <= 0) return(false);
      double minD = StopsMin();
      double sl = 0.0, tp = 0.0;
      bool sent;
      if(dir > 0)
        {
         if(slDist > 0) sl = PriceDown(MathMin(ask - slDist, bid - minD));
         if(tpDist > 0) tp = PriceUp(MathMax(ask + tpDist, bid + minD));
         sent = trade.Buy(lots, _Symbol, 0.0, sl, tp, cm);
        }
      else
        {
         if(slDist > 0) sl = PriceUp(MathMax(bid + slDist, ask + minD));
         if(tpDist > 0) tp = PriceDown(MathMin(bid - tpDist, ask - minD));
         sent = trade.Sell(lots, _Symbol, 0.0, sl, tp, cm);
        }
      if(sent && TradeOk()) { gStatsAt = 0; return(true); }   // өдрийн тоолол шинэчлэгдэнэ
      uint rc = trade.ResultRetcode();
      if(rc != TRADE_RETCODE_REQUOTE && rc != TRADE_RETCODE_PRICE_CHANGED && rc != TRADE_RETCODE_PRICE_OFF) break;
     }
   return(false);
  }

int CountOrders()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == MagicNumber && OrderGetString(ORDER_SYMBOL) == _Symbol) n++;
     }
   return(n);
  }

void DeleteMyOrders()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == MagicNumber && OrderGetString(ORDER_SYMBOL) == _Symbol) trade.OrderDelete(t);
     }
  }

//+------------------------------------------------------------------+
//| Орох шүүлтүүр: бүх хэрэгсэл арилжаа нээхээс өмнө давна.          |
//| Аль нэг нөхцөл хаавал gBlock-д код, gBlockDetail-д тоо үлдэнэ.    |
//+------------------------------------------------------------------+
datetime ServerNow() { return(gTester ? TimeCurrent() : TimeTradeServer()); }
datetime UtcNow()    { return(gTester ? TimeCurrent() - ServerUtcOffset(TimeCurrent()) * 3600 : TimeGMT()); }

// Өнөөдрийн (UTC 00:00 = УБ 08:00-оос хойш) орсон тоо ба дүн. Секундэд нэг л удаа түүх уншина.
void DayStats()
  {
   datetime now = ServerNow();
   if(now == gStatsAt) return;
   gStatsAt = now;
   datetime from = now - (datetime)((long)UtcNow() % 86400);
   int n = 0;
   double closed = 0.0;
   datetime lastBasket = 0;
   if(HistorySelect(from, now + 60))
     {
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
        {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0) continue;
         if(HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber || HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
         closed += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION);
         if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         if(HistoryDealGetString(t, DEAL_COMMENT) == "xau-basket")      // нэг багц = нэг оролт
           {
            datetime dt = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
            bool same = (lastBasket > 0 && dt - lastBasket <= 60);
            lastBasket = dt;
            if(same) continue;
           }
         n++;
        }
     }
   gTradesToday = n;
   gDayPnl = closed + FloatingPnl();
   gDayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE) - closed;
   gDailyLossHit = (gGateOn && gGDailyLossPct > 0 && gDayStartBalance > 0 && gDayPnl <= -gGDailyLossPct / 100.0 * gDayStartBalance);
  }

// Өдрийн алдагдлын хязгаарт хүрмэгц роботын арилжааг хааж, маргааш хүртэл шинээр орохгүй.
void DailyGuard()
  {
   if(!gGateOn || gGDailyLossPct <= 0) { gDailyLossHit = false; return; }
   DayStats();
   if(gDailyLossHit && !gClosing && CountPositions() + CountOrders() > 0)
     {
      Print(L("XauBot: өдрийн алдагдлын хязгаарт хүрлээ (", "XauBot: daily loss stop reached ("), Num(gDayPnl, 2), L("), арилжааг хааж байна", "), closing the trades"));
      gClosing = true;
      CloseAllMine();
     }
  }

// Вэбээс ирсэн HIGH мэдээний хаалттай цонхнууд: "from-to;from-to" (UTC unix секунд)
bool InBlackout(datetime &until)
  {
   if(gBlackouts == "") return(false);
   long now = (long)UtcNow();
   string parts[];
   int n = StringSplit(gBlackouts, ';', parts);
   for(int i = 0; i < n; i++)
     {
      int d = StringFind(parts[i], "-");
      if(d <= 0) continue;
      long a = StringToInteger(StringSubstr(parts[i], 0, d)), b = StringToInteger(StringSubstr(parts[i], d + 1));
      if(now >= a && now <= b) { until = (datetime)b; return(true); }
     }
   return(false);
  }

bool GateBlock(const string code, const string detail)
  {
   gBlock = code;
   gBlockDetail = detail;
   return(false);
  }

string Arrow(const int d) { return(d > 0 ? "↑" : (d < 0 ? "↓" : "→")); }

// dir: +1 BUY, -1 SELL, 0 = чиглэлгүй (зөвхөн цаг, мэдээ, хэлбэлзэл, spread, өдрийн хязгаар)
bool GateCheck(const int dir)
  {
   gBlock = "";
   gBlockDetail = "";
   if(!gGateOn) return(true);
   DayStats();
   if(gDailyLossHit) return(GateBlock("DAILY_LOSS", Num(gDayPnl, 2) + " / -" + Num(gGDailyLossPct / 100.0 * gDayStartBalance, 2)));
   if(gGMaxTrades > 0 && gTradesToday >= gGMaxTrades) return(GateBlock("MAX_TRADES", (string)gTradesToday + " / " + (string)gGMaxTrades));

   datetime utc = UtcNow();
   MqlDateTime u;
   TimeToStruct(utc, u);
   int ubHour = (u.hour + 8) % 24;                                // Улаанбаатар = UTC+8, зуны цаггүй
   if(u.day_of_week == 0 || u.day_of_week == 6) return(GateBlock("SESSION", L("амралтын өдөр", "weekend")));
   bool inSession = (gGStart == gGEnd) || (gGStart < gGEnd ? (ubHour >= gGStart && ubHour < gGEnd) : (ubHour >= gGStart || ubHour < gGEnd));
   if(!inSession) return(GateBlock("SESSION", StringFormat("%02d:%02d UB", ubHour, u.min)));
   MqlDateTime s;
   TimeToStruct(ServerNow(), s);
   if((s.hour == 23 && s.min >= 45) || (s.hour == 0 && s.min < 30))   // брокерын өдрийн солилт: spread тэлдэг
      return(GateBlock("ROLLOVER", StringFormat("%02d:%02d", s.hour, s.min)));
   datetime until = 0;
   if(InBlackout(until)) return(GateBlock("NEWS", (string)(int)MathCeil((double)(until - utc) / 60.0) + L(" мин", " min")));

   double atr = Buf(hGM15Atr, 1);
   if(atr == EMPTY_VALUE || atr <= 0) return(GateBlock("DATA", ""));
   if(gGAtrMin > 0 && atr < gGAtrMin) return(GateBlock("ATR_LOW", "ATR " + Num(atr, 2) + " < " + Num(gGAtrMin, 2)));
   if(gGAtrMax > 0 && atr > gGAtrMax) return(GateBlock("ATR_HIGH", "ATR " + Num(atr, 2) + " > " + Num(gGAtrMax, 2)));
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double spread = ask - bid;
   if(gGSpreadPct > 0 && spread > gGSpreadPct / 100.0 * atr)
      return(GateBlock("SPREAD", "spread " + Num(spread, 2) + " > " + Num(gGSpreadPct / 100.0 * atr, 2)));
   if(dir == 0) return(true);

   if(gGTrend)
     {
      double hf = Buf(hGH1Fast, 1), hs = Buf(hGH1Slow, 1), mf = Buf(hGM15Fast, 1), ms = Buf(hGM15Slow, 1);
      if(hf == EMPTY_VALUE || hs == EMPTY_VALUE || mf == EMPTY_VALUE || ms == EMPTY_VALUE) return(GateBlock("DATA", ""));
      int h1 = (hf > hs) ? 1 : ((hf < hs) ? -1 : 0), m15 = (mf > ms) ? 1 : ((mf < ms) ? -1 : 0);
      if(h1 != dir || m15 != dir) return(GateBlock("TREND", "H1 " + Arrow(h1) + " · M15 " + Arrow(m15)));
     }
   if(gCMin > 0)                                                  // вэбийн олон аргын дүгнэлт орох чиглэлийг дэмжиж байх ёстой
     {
      if(gCTotal <= 0) return(GateBlock("CONSENSUS", L("вэбийн дүгнэлт ирээгүй", "no reading from the web yet")));
      int with = (dir > 0) ? gCBuy : gCSell, against = (dir > 0) ? gCSell : gCBuy;
      if(with < gCMin || with <= against)
         return(GateBlock("CONSENSUS", (dir > 0 ? "BUY " : "SELL ") + (string)with + " / " + (string)gCTotal + L(", эсрэг ", ", against ") + (string)against + L(", шаардлага ", ", needs ") + (string)gCMin));
     }
   if(gGRsiMax > 0)
     {
      double rs = Buf(hGM15Rsi, 0);
      if(rs == EMPTY_VALUE) return(GateBlock("DATA", ""));
      if(dir > 0 && rs > gGRsiMax)          return(GateBlock("RSI", "RSI " + Num(rs, 0) + " > " + Num(gGRsiMax, 0)));
      if(dir < 0 && rs < 100.0 - gGRsiMax)  return(GateBlock("RSI", "RSI " + Num(rs, 0) + " < " + Num(100.0 - gGRsiMax, 0)));
     }
   if(gGExtAtr > 0)
     {
      double e20 = Buf(hGM15Fast, 0);
      if(e20 == EMPTY_VALUE) return(GateBlock("DATA", ""));
      double stretch = dir * (bid - e20) / atr;                   // орох чиглэлд EMA20-оос хэдэн ATR холдсон
      if(stretch > gGExtAtr) return(GateBlock("EXTENDED", Num(stretch, 1) + " ATR > " + Num(gGExtAtr, 1)));
     }
   return(true);
  }

string GateText(const string code)
  {
   if(code == "DAILY_LOSS") return(L("өдрийн алдагдлын хязгаарт хүрсэн, маргааш үргэлжилнэ", "daily loss stop reached, resumes tomorrow"));
   if(code == "MAX_TRADES") return(L("өнөөдрийн орох тоо дууссан", "today's entries are used up"));
   if(code == "SESSION")    return(L("арилжааны цагаас гадуур", "outside the trading hours"));
   if(code == "ROLLOVER")   return(L("брокерын өдрийн солилт, spread тэлдэг", "broker rollover, spreads widen"));
   if(code == "NEWS")       return(L("чухал мэдээний ойр", "close to a high-impact release"));
   if(code == "DATA")       return(L("индикаторын дата ачаалж байна", "loading indicator data"));
   if(code == "ATR_LOW")    return(L("зах хэт тайван", "market too quiet"));
   if(code == "ATR_HIGH")   return(L("зах хэт огцом хөдөлж байна", "market moving too violently"));
   if(code == "SPREAD")     return(L("spread хэт өргөн", "spread too wide"));
   if(code == "TREND")      return(L("H1, M15 тренд орох чиглэлтэй таарахгүй", "the H1 and M15 trend disagree with the entry"));
   if(code == "DAY_BUDGET") return(L("энэ арилжааны эрсдэл өдрийн алдагдлын үлдсэн хязгаараас их", "this trade's risk is larger than what is left of the daily loss limit"));
   if(code == "RISK_SMALL") return(L("тавьсан эрсдэлд доод лот ч багтахгүй (stop хэт ойр болно)", "even the minimum lot does not fit the chosen risk (the stop would be too close)"));
   if(code == "MARGIN")     return(L("чөлөөт margin хүрэлцэхгүй", "not enough free margin"));
   if(code == "SITE_STOP")  return(L("вэбийн шинжилгээний stop-ийн зай ирээгүй", "no stop distance from the site reading yet"));
   if(code == "CONSENSUS")  return(L("олон аргын дүгнэлт орох чиглэлийг дэмжихгүй байна", "the many-method reading does not back this side"));
   if(code == "RSI")        return(L("RSI хэт сунасан", "RSI overstretched"));
   if(code == "EXTENDED")   return(L("үнэ EMA20-оос хэт холдсон", "price too far from EMA20"));
   return(code);
  }

string GateLine()
  {
   if(!gGateOn) return(L("Шүүлтүүр: унтраалттай", "Filter: off"));
   if(gBlock == "") return(L("Шүүлтүүр: нээлттэй", "Filter: pass"));
   return(L("Шүүлтүүр хаасан: ", "Filter blocks: ") + GateText(gBlock) + (gBlockDetail != "" ? " (" + gBlockDetail + ")" : ""));
  }

int SignalDir()
  {
   if(gMode == "ASIAN") return(gDDir != 0 ? gDDir : AsianTrend());
   return(gSignal == "BUY" ? 1 : (gSignal == "SELL" ? -1 : 0));
  }

//+------------------------------------------------------------------+
//| Дохио: M1 EMA9/EMA21 + M5 EMA50 тренд + RSI(7)                    |
//+------------------------------------------------------------------+
void EvaluateSignal()
  {
   double ef = Buf(hEmaFast, 0), es = Buf(hEmaSlow, 0), et = Buf(hEmaTrend, 0), rs = Buf(hRsi, 0);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ef == EMPTY_VALUE || es == EMPTY_VALUE || et == EMPTY_VALUE || rs == EMPTY_VALUE || bid <= 0)
     {
      gSignal = "NONE";
      gReason = L("Индикаторын дата ачаалж байна", "Loading indicator data");
      return;
     }
   string rsi = DoubleToString(rs, 0);
   if(ef > es && bid > et && rs > 50 && rs < 75)
     {
      gSignal = "BUY";
      gReason = L("M1 EMA9 > EMA21 · M5 тренд дээш · RSI ", "M1 EMA9 > EMA21 · M5 trend up · RSI ") + rsi;
     }
   else if(ef < es && bid < et && rs < 50 && rs > 25)
     {
      gSignal = "SELL";
      gReason = L("M1 EMA9 < EMA21 · M5 тренд доош · RSI ", "M1 EMA9 < EMA21 · M5 trend down · RSI ") + rsi;
     }
   else
     {
      gSignal = "NONE";
      if(rs >= 75)      gReason = "RSI " + rsi + L(" хэт өндөр — хүлээж байна", " too high — waiting");
      else if(rs <= 25) gReason = "RSI " + rsi + L(" хэт бага — хүлээж байна", " too low — waiting");
      else              gReason = L("M1 болон M5 чиглэл таарахгүй байна — хүлээж байна", "M1 and M5 do not agree — waiting");
     }
  }

//+------------------------------------------------------------------+
//| Ажиллагааг дуусгах нөхцөлүүд                                     |
//+------------------------------------------------------------------+
void Finish(const string reason)
  {
   gFinished = reason;
   gClosing = true;
   CloseAllMine();
   Print(L("XauBot: ажиллагаа дууслаа — ", "XauBot: run finished — "), reason);
  }

// Хэр удаан ажиллахаа бот өөрөө тооцно.
// Үнэ санамсаргүй алхалттай төстэй хөдөлдөг тул d зайг туулах хугацаа d-ийн квадраттай пропорциональ:
// M1 ATR нь 1 минутын дундаж хөдөлгөөн, target нь tpAtr × ATR → ойролцоогоор tpAtr² минут.
// Түүнийг 1.5 дахин нөөцтэй авч, 30 секундээс 15 минутын хооронд барина.
int PlanSeconds()
  {
   double s = gTpAtr * gTpAtr * 60.0 * 1.5;
   return((int)MathMax(30.0, MathMin(900.0, MathRound(s))));
  }

int ElapsedSeconds()
  {
   if(gFirstEntry <= 0) return(0);
   return((int)(TimeCurrent() - gFirstEntry));
  }

void ManageRun()
  {
   if(gState != "RUNNING" || gFinished != "") return;
   if(RealBlocked())
     {
      Finish("REAL_NOT_ALLOWED");
      return;
     }
   double pnl = RunPnl();
   if(gTarget > 0 && pnl >= gTarget)    { Finish("TARGET");   return; }
   if(gMaxLoss > 0 && pnl <= -gMaxLoss) { Finish("MAX_LOSS"); return; }
   if(gFirstEntry > 0 && gDailyLossHit) { Finish("DAILY_LOSS"); return; }   // өдрийн алдагдлын хязгаар (DailyGuard)
   if(gFirstEntry <= 0)
     {
      if(TimeCurrent() - gRunStart >= WAIT_FOR_SIGNAL_SECONDS) Finish("NO_SIGNAL");
      return;
     }
   if(gMode == "BASKET")
     {
      // Багц зөвхөн нийт ашиг, нийт алдагдлаар хаагдана (дээрх хоёр шалгалт).
      // Бүх арилжаа өөр шалтгаанаар (аваарын stop) хаагдсан бол ажиллагааг дуусгана.
      if(CountPositions() == 0) Finish(pnl >= 0 ? "TARGET" : "MAX_LOSS");
      return;
     }
   if(gStopMode == 1)                                            // вэбийн stop/target-тай арилжаа өөрийн түвшнээрээ хаагдана
     {
      if(CountPositions() == 0) Finish(pnl >= 0 ? "TARGET" : "MAX_LOSS");
      return;
     }
   if(gSignal != "NONE" && gSignal != gRunSide) { Finish("REVERSAL"); return; }   // чиглэл эргэлээ
   if(ElapsedSeconds() >= gPlannedSeconds)      { Finish("TIME");     return; }   // тооцсон хугацаа дууслаа
  }

//+------------------------------------------------------------------+
//| Арилжаа нээх                                                     |
//+------------------------------------------------------------------+
// Багц: дохио гармагц тохируулсан тооны арилжааг нэг дор нээнэ. Нэг ажиллагаанд нэг л багц.
// Үнэ 1.0 хөдлөхөд 1 лотын ашиг/алдагдал дансны валютаар
double PerLot()
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE), tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   return((ts > 0 && tv > 0) ? tv / ts : SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE));
  }

// Нээлттэй арилжаанууд stop-доо хүрвэл одоогийн байдлаас цааш хэдийг алдах вэ
double OpenRiskToStops()
  {
   double sum = 0.0, per = PerLot();
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsMine(t)) continue;
      double sl = PositionGetDouble(POSITION_SL);
      if(sl <= 0) continue;
      bool buy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double px = buy ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double more = (buy ? px - sl : sl - px) * PositionGetDouble(POSITION_VOLUME) * per;
      if(more > 0) sum += more;
     }
   return(sum);
  }

// Шинэ арилжааны эрсдэл өдрийн алдагдлын хязгаарын үлдэгдэлд багтах ёстой. Эс бөгөөс хязгаар нь
// арилжааг stop-доо хүрэхээс өмнө хааж, ердийн хэлбэлзэл бүрийг алдагдал болгодог.
bool FitsDayBudget(const double lots, const double slDist)
  {
   if(!gGateOn || gGDailyLossPct <= 0 || slDist <= 0) return(true);
   gStatsAt = 0;
   DayStats();
   double left = gGDailyLossPct / 100.0 * gDayStartBalance + gDayPnl - OpenRiskToStops();
   double risk = lots * slDist * PerLot();
   if(risk <= left + 1e-9) return(true);
   return(GateBlock("DAY_BUDGET", "$" + Num(risk, 2) + " > $" + Num(MathMax(0.0, left), 2)));
  }

// Эрсдэлээр хэмжээ тогтооно. gRiskMode: 0 = тогтмол лот, 1 = арилжаа бүрт $ дүн, 2 = балансын %.
// Тооцсон лот брокерын доод лотоос бага гарвал (жижиг данс) stop-ийг ойртуулж доод лотоор орно:
// эрсдэл хэвээр, ашгийн зай мөн адил харьцаагаар багасна. Stop нь spread, stops level-ээс ойртох
// шаардлагатай бол орохгүй (RISK_SMALL). canShrink = false бол stop-ийг хөдөлгөхгүй (дүрмийн stop).
bool SizeTrade(double &slDist, double &tpDist, double &lots, const bool canShrink)
  {
   if(gRiskMode == 0 || slDist <= 0)
     {
      lots = NormLots(gLots);
      if(lots <= 0) { gReason = L("Лот брокерын доод хэмжээнээс бага байна", "Lots are below the broker's minimum"); return(false); }
      return(true);
     }
   double risk = (gRiskMode == 1) ? gRiskVal : gRiskVal / 100.0 * AccountInfoDouble(ACCOUNT_BALANCE);
   double perLot = PerLot();
   if(risk <= 0 || perLot <= 0) return(GateBlock("RISK_SMALL", ""));
   lots = NormLots(risk / (slDist * perLot));
   if(lots <= 0)
     {
      double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      if(vmin <= 0) vmin = 0.01;
      double need = risk / (vmin * perLot);                       // доод лотоор энэ эрсдэлд багтах stop-ийн зай
      double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double floorD = MathMax(StopsMin(), 3.0 * spread);
      if(!canShrink || need < floorD)
         return(GateBlock("RISK_SMALL", "$" + Num(risk, 2) + L(" эрсдэлд доод лот ", " risk, min lot ") + Num(vmin, 2) + " → stop " + Num(need, 2) + " < " + Num(floorD, 2)));
      if(tpDist > 0) tpDist = tpDist * need / slDist;
      slDist = need;
      lots = NormLots(vmin);
     }
   double margin = 0.0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, lots, SymbolInfoDouble(_Symbol, SYMBOL_ASK), margin) && margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE))
      return(GateBlock("MARGIN", Num(margin, 2) + " > " + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2)));
   return(lots > 0);
  }

void TryBasket()
  {
   if(gFirstEntry > 0) return;                                   // багц аль хэдийн нээгдсэн
   if(gTarget <= 0 || gMaxLoss <= 0) { gReason = L("Багцын ашиг, алдагдлын дүн тохируулаагүй", "The basket profit and loss amounts are not set"); return; }
   if(RealBlocked()) return;
   if(!gTester && TimeLocal() - gLastSyncOk > 30) return;
   if(TimeCurrent() - gLastEntry < EntryCooldownSeconds) return;
   if(!TradingAllowed()) return;
   if(SpreadPoints() > MaxSpreadPoints) return;
   int dir = (gSignal == "BUY") ? 1 : -1;
   if(!GateCheck(dir)) return;                                   // орох шүүлтүүр: шалтгаан gBlock-д

   double lots = NormLots(gLots);
   if(lots <= 0) { gReason = L("Лот брокерын доод хэмжээнээс бага байна", "Lots are below the broker's minimum"); return; }

   // Аваарын stop: робот, компьютер унтарсан үед л ажиллах ёстой тул нийт алдагдлын хязгаараас 2 дахин хол тавина.
   double contract = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   if(contract <= 0) contract = 100.0;
   double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double slDist = 2.0 * gMaxLoss / (lots * gMaxPos * contract) + spread;   // stops level-ийг SendMarket хангана

   string side = gSignal;
   int opened = 0;
   for(int i = 0; i < gMaxPos; i++)
     {
      bool ok = SendMarket(dir, lots, slDist, 0.0, "xau-basket");
      if(ok) opened++;
      else
        {
         Print(L("XauBot: багцын захиалга амжилтгүй — ", "XauBot: basket order failed — "), trade.ResultRetcodeDescription());
         break;                                                  // брокер татгалзвал үлдсэнийг оролдохгүй
        }
     }
   gLastEntry = TimeCurrent();
   if(opened > 0)
     {
      gFirstEntry = TimeCurrent();
      gRunSide = side;
      gPlannedSeconds = 0;                                       // багцад хугацааны хязгаар байхгүй
      Print(L("XauBot: багц нээгдлээ — ", "XauBot: basket opened — "), side, " ", (string)opened, " / ", (string)gMaxPos, L(" арилжаа, лот ", " trades, lots "), Num(lots, 2));
     }
  }

void TryEnter()
  {
   if(gState != "RUNNING" || gFinished != "" || gSignal == "NONE") return;
   if(gMode == "BASKET") { TryBasket(); return; }
   if(gRunSide != "" && gSignal != gRunSide) return;                // нэг удаад нэг чиглэлд л ажиллана
   if(RealBlocked()) return;
   if(!gTester && TimeLocal() - gLastSyncOk > 30) return;                    // вэбтэй холбоо тасарсан үед шинээр нээхгүй
   if(TimeCurrent() - gLastEntry < EntryCooldownSeconds) return;
   if(CountPositions() >= gMaxPos) return;
   if(!TradingAllowed()) return;
   if(SpreadPoints() > MaxSpreadPoints) return;

   double atr = Buf(hAtr, 0);
   if(atr == EMPTY_VALUE || atr <= 0) return;
   int dir = (gSignal == "BUY") ? 1 : -1;
   if(!GateCheck(dir)) return;                                   // орох шүүлтүүр: шалтгаан gBlock-д

   // Stop, target: вэбийн шинжилгээний H1 ATR-аас (gStopMode 1) эсвэл M1 ATR-аас
   double slD = gSlAtr * atr, tpD = gTpAtr * atr;
   if(gStopMode == 1)
     {
      if(gTester) { double h1 = Buf(hH1Atr, 1); gSiteAtr = (h1 == EMPTY_VALUE) ? 0.0 : h1; }   // tester: вэбгүй тул H1 ATR-ийг өөрөө уншина
      if(gSiteAtr <= 0) { GateBlock("SITE_STOP", ""); return; }
      slD = gSiteStopMult * gSiteAtr;
      tpD = slD * gSiteRR;
     }
   double lots = 0.0;
   if(!SizeTrade(slD, tpD, lots, true)) return;                  // шалтгаан gBlock эсвэл gReason-д
   if(!FitsDayBudget(lots, slD)) return;
   if(TotalVolume() + lots > lots * gMaxPos + 1e-8) return;      // netting дансанд ч нийт лот хэтрэхгүй
   bool ok = SendMarket(dir, lots, slD, tpD, "xau-bot:" + Num(slD, 2));   // stops level, tick-ийг SendMarket хангана; тайлбарт анхны эрсдэлийн зай (R)

   gLastEntry = TimeCurrent();                                   // амжилтгүй болсон ч дараагийн оролдлогыг хүлээлгэнэ
   if(!ok)
     {
      Print(L("XauBot: захиалга амжилтгүй — ", "XauBot: order failed — "), trade.ResultRetcodeDescription());
      return;
     }
   if(gFirstEntry <= 0)                                          // энэ удаагийн анхны арилжаа: чиглэл, хугацааг тогтооно
     {
      gFirstEntry = TimeCurrent();
      gRunSide = gSignal;
      gPlannedSeconds = (gStopMode == 1) ? 0 : PlanSeconds();
      Print("XauBot: ", gRunSide, L(" чиглэлд ", " side, planned to run "), (string)gPlannedSeconds, L(" секунд ажиллахаар тооцлоо", " seconds"));
     }
  }

//+------------------------------------------------------------------+
//| Дүрэм 1-4: урьдчилан тогтоосон дүрмүүд, зөвхөн Strategy Tester    |
//| Бүгд хаагдсан лаагаар шийднэ, өдөрт нэг арилжаа, тогтмол лот.     |
//+------------------------------------------------------------------+
bool IsRuleTool() { return(gTester && TesterTool >= TOOL_ASIAN); }

datetime LastSundayOf(const int year, const int mon)
  {
   MqlDateTime d;
   ZeroMemory(d);
   d.year = year; d.mon = mon; d.day = 31;                       // 3, 10-р сар хоёулаа 31 хоногтой
   datetime t = StructToTime(d);
   MqlDateTime w;
   TimeToStruct(t, w);
   return(t - w.day_of_week * 86400);
  }

int ServerUtcOffset(const datetime serverTime)
  {
   // Live: the broker's clock is read directly (server time minus UTC), so any broker and any summer-time rule works.
   // The tester simulates both clocks, so there the inputs below are used.
   if(!gTester && ServerUtcAuto)
     {
      long diff = (long)TimeTradeServer() - (long)TimeGMT();
      return((int)MathRound(diff / 3600.0));
     }
   if(!ServerDstEurope) return(ServerUtcOffsetWinter);
   MqlDateTime s;
   TimeToStruct(serverTime, s);
   datetime from = LastSundayOf(s.year, 3) + 3 * 3600;
   datetime to   = LastSundayOf(s.year, 10) + 3 * 3600;
   return((serverTime >= from && serverTime < to) ? ServerUtcOffsetWinter + 1 : ServerUtcOffsetWinter);
  }

// Сүүлд хаагдсан өдрийн тренд: D1 EMA20 нь EMA50-аас дээш бол +1, доош бол -1
int DailyTrend()
  {
   double f = Buf(hD1Fast, 1), sl = Buf(hD1Slow, 1);
   if(f == EMPTY_VALUE || sl == EMPTY_VALUE) return(0);
   return(f > sl ? 1 : (f < sl ? -1 : 0));
  }

//+------------------------------------------------------------------+
//| Сайтын тренд оноо (lib/bot/strategy.ts scoreSeries)-г яг давтана: |
//| EMA50, EMA200, EMA20-ийн налуу, RSI14, MACD гистограм, swing      |
//| бүтэц. Сүүлд хаагдсан лаан дээр, лаа шинэ гарахад л дахин тооцно. |
//+------------------------------------------------------------------+
void EmaArr(const double &v[], const int n, const int period, double &out[])
  {
   ArrayResize(out, n);
   ArrayInitialize(out, EMPTY_VALUE);
   if(n < period) return;
   double prev = 0.0;
   for(int i = 0; i < period; i++) prev += v[i];
   prev /= period;
   out[period - 1] = prev;
   double k = 2.0 / (period + 1);
   for(int i = period; i < n; i++) { prev = v[i] * k + prev * (1.0 - k); out[i] = prev; }
  }

double TrendScoreCalc(const ENUM_TIMEFRAMES tf)
  {
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = 0;
   if(tf == PERIOD_W1)
     {
      // Долоо хоногийг өдрийн лаанаас бүтээнэ (сайттай ижил, даваа гарагаас): дуусаагүй долоо хоногийг тооцохгүй
      MqlRates d[];
      ArraySetAsSeries(d, false);
      int nd = CopyRates(_Symbol, PERIOD_D1, 1, 3000, d);
      if(nd <= 0) return(EMPTY_VALUE);
      ArrayResize(r, nd);
      long curWeek = -1;
      for(int i = 0; i < nd; i++)
        {
         MqlDateTime t;
         TimeToStruct(d[i].time, t);
         long wk = (long)(d[i].time / 86400) - ((t.day_of_week + 6) % 7);   // тухайн долоо хоногийн даваа гараг (хоногоор)
         if(n > 0 && wk == curWeek) { r[n - 1].high = MathMax(r[n - 1].high, d[i].high); r[n - 1].low = MathMin(r[n - 1].low, d[i].low); r[n - 1].close = d[i].close; }
         else { r[n] = d[i]; n++; curWeek = wk; }
        }
      MqlDateTime nowT;
      TimeToStruct(iTime(_Symbol, PERIOD_D1, 0), nowT);
      long thisWeek = (long)(iTime(_Symbol, PERIOD_D1, 0) / 86400) - ((nowT.day_of_week + 6) % 7);
      if(n > 0 && curWeek == thisWeek) n--;                       // энэ долоо хоног дуусаагүй
     }
   else n = CopyRates(_Symbol, tf, 1, 1500, r);                  // хамгийн сүүлд хаагдсан лаа хүртэл, хуучнаас шинэ рүү
   if(n < 210) return(EMPTY_VALUE);
   double c[];
   ArrayResize(c, n);
   for(int i = 0; i < n; i++) c[i] = r[i].close;
   double e20[], e50[], e200[], f12[], f26[];
   EmaArr(c, n, 20, e20); EmaArr(c, n, 50, e50); EmaArr(c, n, 200, e200); EmaArr(c, n, 12, f12); EmaArr(c, n, 26, f26);
   // Wilder RSI 14
   double gain = 0.0, loss = 0.0, rs = 50.0;
   for(int i = 1; i <= 14; i++) { double d = c[i] - c[i - 1]; if(d > 0) gain += d; else loss -= d; }
   gain /= 14.0; loss /= 14.0;
   for(int i = 15; i < n; i++) { double d = c[i] - c[i - 1]; gain = (gain * 13.0 + MathMax(d, 0.0)) / 14.0; loss = (loss * 13.0 + MathMax(-d, 0.0)) / 14.0; }
   rs = (loss == 0.0) ? (gain == 0.0 ? 50.0 : 100.0) : 100.0 - 100.0 / (1.0 + gain / loss);
   // MACD гистограм: (EMA12 - EMA26) - түүний EMA9
   double line[];
   int start = 25, m = n - start;
   ArrayResize(line, m);
   for(int i = 0; i < m; i++) line[i] = f12[start + i] - f26[start + i];
   double sig[];
   EmaArr(line, m, 9, sig);
   int last = n - 1;
   double hist = (sig[m - 1] == EMPTY_VALUE) ? 0.0 : line[m - 1] - sig[m - 1];
   double sc = 0.0;
   sc += (c[last] > e50[last]) ? 20 : -20;
   sc += (c[last] > e200[last]) ? 20 : -20;
   sc += (e20[last] > e20[last - 5]) ? 10 : -10;
   sc += MathMax(-1.0, MathMin(1.0, (rs - 50.0) / 20.0)) * 15.0;
   sc += (hist > 0) ? 15 : -15;
   // сүүлийн 120 лаан доторх swing: fractal-д дараагийн лаа хэрэгтэй тул хамгийн шинэ нь last - 1
   double hs[2], ls[2];
   int nh = 0, nl = 0;
   int first = MathMax(0, last - 119) + 1;
   for(int g = last - 1; g >= first && (nh < 2 || nl < 2); g--)
     {
      if(g + 1 > last || g - 1 < 0) continue;
      if(nh < 2 && r[g].high > r[g - 1].high && r[g].high > r[g + 1].high) hs[nh++] = r[g].high;
      if(nl < 2 && r[g].low < r[g - 1].low && r[g].low < r[g + 1].low) ls[nl++] = r[g].low;
     }
   if(nh == 2 && nl == 2)
     {
      if(hs[0] > hs[1] && ls[0] > ls[1]) sc += 20;
      else if(hs[0] < hs[1] && ls[0] < ls[1]) sc -= 20;
     }
   return(sc);
  }

datetime gScD1At = 0, gScH4At = 0, gScW1At = 0;
double   gScD1 = EMPTY_VALUE, gScH4 = EMPTY_VALUE, gScW1 = EMPTY_VALUE;
double TrendScore(const ENUM_TIMEFRAMES tf)
  {
   datetime bar = iTime(_Symbol, tf, 1);
   if(tf == PERIOD_D1) { if(bar != gScD1At) { gScD1 = TrendScoreCalc(tf); gScD1At = bar; } return(gScD1); }
   if(tf == PERIOD_W1) { datetime dbar = iTime(_Symbol, PERIOD_D1, 1); if(dbar != gScW1At) { gScW1 = TrendScoreCalc(tf); gScW1At = dbar; } return(gScW1); }
   if(bar != gScH4At) { gScH4 = TrendScoreCalc(tf); gScH4At = bar; }
   return(gScH4);
  }

// Азийн дүрмийн чиглэл: өдөр, 4 цагийн тренд оноо нэг тэмдэгтэй бол тэр чиглэл, үгүй бол 0
int AsianTrend()
  {
   double d = TrendScore(PERIOD_D1), h = TrendScore(PERIOD_H4);
   if(d == EMPTY_VALUE || h == EMPTY_VALUE || d == 0 || h == 0) return(0);
   if(TesterWeekly)                                              // долоо хоногийн тренд ч нэг чиглэлд байх (туршилт)
     {
      double w = TrendScore(PERIOD_W1);
      if(w == EMPTY_VALUE || w == 0 || (w > 0) != (d > 0)) return(0);
     }
   if(d > 0 && h > 0) return(1);
   if(d < 0 && h < 0) return(-1);
   return(0);
  }

#define ASIAN_RR 3.0                 // сайтын ASIAN_RR (lib/setup/setups.ts)
#define ASIAN_MIN_STOP_ATR 0.25      // stop өдрийн ATR-ийн үүнээс бага бол тэр өдөр орохгүй (lib/bot/ideas.ts)
// Сайтын setup-ууд (lib/setup/sessionRules.ts), UTC цагаар: хүрээ эхлэх, дуусах, орох цонх дуусах
#define SESSION_COUNT 3
const string SES_NAME[SESSION_COUNT]    = { "asian", "ny-open", "ny-late" };
const double SES_FROM[SESSION_COUNT]    = { 0.0, 12.5, 13.5 };
const double SES_TO[SESSION_COUNT]      = { 7.0, 13.5, 14.5 };
const double SES_ENTRY[SESSION_COUNT]   = { 12.0, 18.0, 17.0 };
const double SES_RR[SESSION_COUNT]      = { 3.0, 2.0, 2.0 };
const bool   SES_NEXT07[SESSION_COUNT]  = { false, false, true };
const int    SES_MINBARS[SESSION_COUNT] = { 20, 3, 3 };
const double SES_MINDAILY[SESSION_COUNT]= { 0.0, 35.0, 35.0 };   // өдрийн трендийн онооны доод хэмжээ (сайтын minDailyScore)
int    gSesDay[SESSION_COUNT]  = { -1, -1, -1 };
double gSesHi[SESSION_COUNT], gSesLo[SESSION_COUNT];
int    gSesBars[SESSION_COUNT];
bool   gSesDone[SESSION_COUNT];

// Сүүлд хаагдсан өдрийн Wilder ATR(14) — сайтын atrSeries-тэй ижил
datetime gAtrD1At = 0;
double   gAtrD1 = EMPTY_VALUE;
double DailyAtr()
  {
   datetime bar = iTime(_Symbol, PERIOD_D1, 1);
   if(bar == gAtrD1At) return(gAtrD1);
   gAtrD1At = bar;
   gAtrD1 = EMPTY_VALUE;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, PERIOD_D1, 1, 1500, r);
   if(n <= 15) return(gAtrD1);
   double v = 0.0;
   for(int i = 1; i <= 14; i++) v += MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i - 1].close), MathAbs(r[i].low - r[i - 1].close)));
   v /= 14.0;
   for(int i = 15; i < n; i++) v = (v * 13.0 + MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i - 1].close), MathAbs(r[i].low - r[i - 1].close)))) / 14.0;
   gAtrD1 = v;
   return(gAtrD1);
  }

double RuleLots() { return(NormLots(gTester ? TesterLots : gLots)); }

// Арилжаа хийх боломжтой эсэх: Algo Trading асаалттай, брокер тухайн symbol-д шинэ арилжаа зөвшөөрч байгаа
bool TradingAllowed()
  {
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return(false);
   long m = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
   return(m != SYMBOL_TRADE_MODE_DISABLED && m != SYMBOL_TRADE_MODE_CLOSEONLY);
  }

// dir: +1 BUY, -1 SELL. slDist, tpDist нь орох үнээс тооцсон зай. Орох шүүлтүүрийг давах ёстой.
// Сайтын трендийн хүчний коэффициент (sizeFactor): лотыг үржүүлнэ. Доод лотоос бага болбол өмнөх лотоо үлдээнэ.
double gNextMul = 1.0;                                        // tester: дараагийн RuleOpen-ийн коэффициент
double ApplyMul(const double lots, const double mul)
  {
   if(mul <= 0 || MathAbs(mul - 1.0) < 1e-9) return(lots);
   double m = MathMax(0.25, MathMin(2.0, mul));
   double l2 = NormLots(lots * m);
   return(l2 > 0 ? l2 : lots);
  }

// Трендийн хүчээр лотын коэффициент (сайтын lib/setup/sessionRules.ts sizeFactor-тэй ижил)
double SizeFactor()
  {
   double d = TrendScore(PERIOD_D1), h = TrendScore(PERIOD_H4);
   if(d == EMPTY_VALUE || h == EMPTY_VALUE) return(1.0);
   d = MathAbs(d); h = MathAbs(h);
   if(d < 35 || h < 35) return(0.75);
   if(d >= 65 && h >= 65) return(1.25);
   return(1.0);
  }

bool RuleOpen(const int dir, const double slDist, const double tpDist, const datetime exitAt)
  {
   if(SpreadPoints() > MaxSpreadPoints) return(false);
   if(slDist <= StopsMin() || tpDist <= StopsMin()) return(false);   // хүрээ хэт нарийн: stop тавих боломжгүй
   if(!GateCheck(dir)) return(false);
   double lots = RuleLots(), sl = slDist, tp = tpDist;
   if((!gTester || gRiskMode > 0) && !SizeTrade(sl, tp, lots, false)) return(false);   // дүрмийн stop-ийг хөдөлгөхгүй, зөвхөн хэмжээг тооцно (tester-т эрсдэлийн горимтой бол ч)
   lots = ApplyMul(lots, gNextMul * (SameDirOpen(dir) ? SAME_DIR_MUL : 1.0));
   gNextMul = 1.0;
   if(lots <= 0) return(false);
   if(!gTester && !FitsDayBudget(lots, sl)) return(false);
   // Хаах цагийг арилжааны comment-д хадгална (серверийн цаг): робот дахин ачаалсан ч мэднэ
   bool ok = SendMarket(dir, lots, sl, tp, "xau-r:" + IntegerToString((long)exitAt));
   if(ok)
     {
      gRuleTraded = true;
      gRuleExitAt = exitAt;
     }
   return(ok);
  }

void RangeAdd(const double h, const double l)
  {
   if(gRangeBars == 0) { gRangeHigh = h; gRangeLow = l; }
   else { gRangeHigh = MathMax(gRangeHigh, h); gRangeLow = MathMin(gRangeLow, l); }
   gRangeBars++;
  }

void RuleStep()
  {
   if(TesterTool == TOOL_ICT)  { IctStep(); return; }
   if(TesterTool == TOOL_SMCX) { SxStep(); return; }
   if(TesterTool == TOOL_STRADDLE) { StStep(); return; }
   if(TesterTool == TOOL_ASIAN) AsianTimeExit();                // арилжаа бүр өөрийн хаах цагтай (comment-д)
   else if(CountPositions() > 0 && gRuleExitAt > 0 && TimeCurrent() >= gRuleExitAt)
     {
      CloseAllMine();                                            // барих хугацаа дууслаа
      if(CountPositions() == 0) gRuleExitAt = 0;
     }
   datetime bar = iTime(_Symbol, PERIOD_M15, 0);
   if(bar == gRuleLastBar) return;                               // шинэ M15 лаа нээгдэхэд л шийднэ
   gRuleLastBar = bar;
   datetime closed = iTime(_Symbol, PERIOD_M15, 1);              // саяхан хаагдсан лаа
   if(closed <= 0) return;
   int offset = ServerUtcOffset(closed);
   datetime utc = closed - offset * 3600;
   MqlDateTime u;
   TimeToStruct(utc, u);
   if(u.day_of_year != gRuleDay)
     {
      gRuleDay = u.day_of_year;
      gRuleTraded = false;
      gRangeBars = 0;
     }
   if(u.day_of_week == 0 || u.day_of_week == 6) return;
   double h = iHigh(_Symbol, PERIOD_M15, 1), l = iLow(_Symbol, PERIOD_M15, 1), c = iClose(_Symbol, PERIOD_M15, 1);
   datetime dayStartServer = closed - (u.hour * 3600 + u.min * 60 + u.sec);   // UTC 00:00, серверийн цагаар
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if(TesterTool == TOOL_ASIAN)
     {
      // Сайтын 3 setup (lib/setup/sessionRules.ts): хүрээ бүрийн оргил/ёроол, өдөр + 4 цагийн тренд нэг чиглэлд
      // байхад орох цонхонд хүрээнээс тэр чиглэлд гарч хаагдсан эхний лаа. Stop: хүрээний дунд. Target: stop × RR.
      double hf = u.hour + u.min / 60.0;
      for(int k = 0; k < SESSION_COUNT; k++)
        {
         if(gSesDay[k] != u.day_of_year) { gSesDay[k] = u.day_of_year; gSesHi[k] = 0.0; gSesLo[k] = 0.0; gSesBars[k] = 0; gSesDone[k] = false; }
         if(hf >= SES_FROM[k] && hf < SES_TO[k])
           {
            if(gSesBars[k] == 0) { gSesHi[k] = h; gSesLo[k] = l; } else { gSesHi[k] = MathMax(gSesHi[k], h); gSesLo[k] = MathMin(gSesLo[k], l); }
            gSesBars[k]++;
            continue;
           }
         if(gSesDone[k] || hf < SES_TO[k] || hf >= SES_ENTRY[k] || gSesBars[k] < SES_MINBARS[k] || CountPositions() >= TesterMaxOpen) continue;
         int trend = AsianTrend();
         int dir = (trend > 0 && c > gSesHi[k]) ? 1 : ((trend < 0 && c < gSesLo[k]) ? -1 : 0);
         if(dir == 0) continue;
         gSesDone[k] = true;                                     // эхний breakout өдрийг шийднэ (сайттай ижил)
         if(SES_MINDAILY[k] > 0 && MathAbs(TrendScore(PERIOD_D1)) < SES_MINDAILY[k]) continue;   // тренд сул: өдрийг алгасна
         double mid = (gSesHi[k] + gSesLo[k]) / 2.0;
         double atrD = DailyAtr();
         if(atrD == EMPTY_VALUE || MathAbs(c - mid) < ASIAN_MIN_STOP_ATR * atrD) continue;   // хүрээ хэт нарийн
         double dist = MathAbs(price - mid);
         bool friday = (u.day_of_week == 5);
         datetime exitAt = dayStartServer + ((SES_NEXT07[k] && !friday) ? 31 : 20) * 3600;
         gNextMul = SizeFactor();                                // трендийн хүчээр лот (сайттай ижил)
         if(RuleOpen(dir, dist, dist * SES_RR[k], exitAt))
            Print("XauBot tester: ", SES_NAME[k], " ", (dir > 0 ? "BUY" : "SELL"), " utc ", TimeToString(utc + 15 * 60, TIME_DATE | TIME_MINUTES), " risk ", Num(dist, 2));
        }
      return;
     }
   if(TesterTool == TOOL_LONDON)
     {
      // Хүрээ: 07:00-08:00 UTC (Лондон нээлтийн эхний цаг). 08:00-11:00 UTC-д хүрээнээс гарч хаагдсан эхний лаа, аль ч чиглэлд.
      // Stop: хүрээний нөгөө тал. Target: stop-оос 1.5 дахин хол. 15:00 UTC-д хаана.
      if(u.hour < 7) return;
      if(u.hour == 7) { RangeAdd(h, l); return; }
      if(gRuleTraded || gRangeBars < 4 || u.hour >= 11 || CountPositions() > 0) return;
      int dir = (c > gRangeHigh) ? 1 : ((c < gRangeLow) ? -1 : 0);
      if(dir == 0) return;
      double dist = (dir > 0) ? price - gRangeLow : gRangeHigh - price;
      RuleOpen(dir, dist, dist * 1.5, dayStartServer + 15 * 3600);
      return;
     }

   // Дүрэм 3, 4 нь 1 цагийн лаа хаагдахад шийднэ
   if(u.min != 45) return;
   if(gRuleTraded || CountPositions() > 0) return;
   if(u.hour < 7 || u.hour >= 20) return;                        // Лондон, Нью-Йоркийн цагт л
   if(u.day_of_week == 5 && u.hour >= 16) return;                // баасан гарагийн оройд шинээр орохгүй
   double e20 = Buf(hH1Ema20, 1), e50 = Buf(hH1Ema50, 1), rs = Buf(hH1Rsi, 1), atr = Buf(hH1Atr, 1);
   if(e20 == EMPTY_VALUE || e50 == EMPTY_VALUE || rs == EMPTY_VALUE || atr == EMPTY_VALUE || atr <= 0) return;
   double h1Low = iLow(_Symbol, PERIOD_H1, 1), h1High = iHigh(_Symbol, PERIOD_H1, 1), h1Close = iClose(_Symbol, PERIOD_H1, 1);

   if(TesterTool == TOOL_PULLBACK)
     {
      // Өдрийн тренд дээш, 1 цагийн EMA20 > EMA50, лаа EMA20-д хүрч буцаад дээр нь хаагдсан, RSI(14) > 50 бол BUY (доош трендэд эсрэгээр).
      // Stop 1.5 ATR, target 3 ATR, 24 цагийн дотор хаана.
      int trend = DailyTrend();
      int dir = 0;
      if(trend > 0 && e20 > e50 && h1Low <= e20 && h1Close > e20 && rs > 50) dir = 1;
      if(trend < 0 && e20 < e50 && h1High >= e20 && h1Close < e20 && rs < 50) dir = -1;
      if(dir == 0) return;
      RuleOpen(dir, 1.5 * atr, 3.0 * atr, TimeCurrent() + 24 * 3600);
      return;
     }
   if(TesterTool == TOOL_FADE)
     {
      // Үнэ 1 цагийн EMA20-оос 2 ATR-аас илүү холдож, RSI(14) 25-аас доош бол BUY (75-аас дээш бол SELL).
      // Stop 1.5 ATR, target нь EMA20 руу буцах зай, 12 цагийн дотор хаана.
      int dir = 0;
      if(h1Close < e20 - 2.0 * atr && rs < 25) dir = 1;
      if(h1Close > e20 + 2.0 * atr && rs > 75) dir = -1;
      if(dir == 0) return;
      RuleOpen(dir, 1.5 * atr, MathAbs(e20 - price), TimeCurrent() + 12 * 3600);
      return;
     }
  }

//+------------------------------------------------------------------+
//| ICT / SMC хэрэгсэл (Strategy Tester).                             |
//| Дүрмийг тестийн өмнө тогтоосон: trader-ict-bot-preregistration.md |
//| Bias (H4 бүтэц) → liquidity sweep → MSS → FVG → OTE-д limit орох. |
//+------------------------------------------------------------------+
bool IctVariant(const int v) { return(TesterIctVariant == v); }

// H4 бүтэц: хаалт сүүлийн баталгаажсан 2/2 swing high-аас дээш гарвал +1, swing low-оос доош бол -1
int H4StructureBias()
  {
   datetime last = iTime(_Symbol, PERIOD_H4, 1);
   if(last == gH4BiasBar) return(gH4Bias);
   gH4BiasBar = last;
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, PERIOD_H4, 1, 300, r);
   int bias = 0;
   if(n >= 50)
     {
      double sh = 0, sl = 0;
      for(int j = 4; j < n; j++)
        {
         int k = j - 2;
         if(r[k].high > r[k-1].high && r[k].high > r[k-2].high && r[k].high > r[k+1].high && r[k].high > r[k+2].high) sh = r[k].high;
         if(r[k].low < r[k-1].low && r[k].low < r[k-2].low && r[k].low < r[k+1].low && r[k].low < r[k+2].low) sl = r[k].low;
         if(sh > 0 && r[j].close > sh) { bias = 1; sh = 0; }
         if(sl > 0 && r[j].close < sl) { bias = -1; sl = 0; }
        }
     }
   gH4Bias = bias;
   return(bias);
  }

// Өмнөх арилжааны өдөр (UTC): high/low ба tick volume profile (100 бин, value area 70%)
bool PrevDayLevels(const datetime dayStart)
  {
   for(int d = 1; d <= 4; d++)
     {
      MqlRates r[];
      ArraySetAsSeries(r, false);
      datetime from = dayStart - d * 86400;
      int n = CopyRates(_Symbol, PERIOD_M5, from, from + 86400 - 1, r);
      if(n < 100) continue;                                      // амралтын өдөр бол өмнөх өдрийг авна
      double hi = r[0].high, lo = r[0].low;
      for(int i = 1; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
      if(hi <= lo) return(false);
      gPdh = hi; gPdl = lo;
      double vol[100];
      ArrayInitialize(vol, 0.0);
      double size = (hi - lo) / 100.0, total = 0;
      for(int i = 0; i < n; i++)
        {
         int b0 = (int)MathFloor((r[i].low - lo) / size), b1 = (int)MathFloor((r[i].high - lo) / size);
         b0 = MathMax(0, MathMin(99, b0));
         b1 = MathMax(0, MathMin(99, b1));
         double share = (double)r[i].tick_volume / (b1 - b0 + 1);
         for(int b = b0; b <= b1; b++) vol[b] += share;
         total += (double)r[i].tick_volume;
        }
      int poc = ArrayMaximum(vol, 0, WHOLE_ARRAY);
      int up = poc, dn = poc;
      double acc = vol[poc];
      while(acc < 0.7 * total && (up < 99 || dn > 0))
        {
         double above = (up < 99) ? vol[up + 1] : -1.0, below = (dn > 0) ? vol[dn - 1] : -1.0;
         if(above >= below) { up++; acc += vol[up]; }
         else               { dn--; acc += vol[dn]; }
        }
      gVah = lo + (up + 1) * size;
      gVal = lo + dn * size;
      return(true);
     }
   return(false);
  }

// Азийн хүрээ: 00:00-07:00 UTC
bool AsiaRange(const datetime dayStart)
  {
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, PERIOD_M5, dayStart, dayStart + 7 * 3600 - 1, r);
   if(n < 60) return(false);
   gAsiaH = r[0].high; gAsiaL = r[0].low;
   for(int i = 1; i < n; i++) { gAsiaH = MathMax(gAsiaH, r[i].high); gAsiaL = MathMin(gAsiaL, r[i].low); }
   return(true);
  }

void IctResetSetup() { gSetDir = 0; gMss = false; }

// Sweep эхэлсэн: MSS-ийн түвшин нь sweep-ээс өмнөх хамгийн сүүлийн 2/2 fractal
void IctBeginSetup(const int dir, const datetime t, const double ext)
  {
   gSetDir = dir; gSweepTime = t; gSweepExt = ext; gMss = false; gMssLevel = 0;
   gLegExt = (dir > 0) ? iHigh(_Symbol, PERIOD_M5, 1) : iLow(_Symbol, PERIOD_M5, 1);
   for(int k = 3; k < 300; k++)
     {
      if(dir > 0)
        {
         double v = iHigh(_Symbol, PERIOD_M5, k);
         if(v > iHigh(_Symbol, PERIOD_M5, k - 1) && v > iHigh(_Symbol, PERIOD_M5, k - 2) && v > iHigh(_Symbol, PERIOD_M5, k + 1) && v > iHigh(_Symbol, PERIOD_M5, k + 2)) { gMssLevel = v; break; }
        }
      else
        {
         double v = iLow(_Symbol, PERIOD_M5, k);
         if(v < iLow(_Symbol, PERIOD_M5, k - 1) && v < iLow(_Symbol, PERIOD_M5, k - 2) && v < iLow(_Symbol, PERIOD_M5, k + 1) && v < iLow(_Symbol, PERIOD_M5, k + 2)) { gMssLevel = v; break; }
        }
     }
   if(gMssLevel == 0) IctResetSetup();
  }

bool IctHasExposure() { return(gIctOrder > 0 || CountPositions() > 0); }

// Хүлээгдэж буй захиалга: killzone дуусах эсвэл target түрүүлж хүрвэл цуцална. Нээгдсэн арилжааг 20:00 UTC-д хаана.
void IctManageOrders()
  {
   if(gIctOrder > 0)
     {
      if(OrderSelect(gIctOrder))
        {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         bool reached = (gIctOrderDir > 0) ? bid >= gIctOrderTp : ask <= gIctOrderTp;
         if(TimeCurrent() >= gIctOrderEnd || reached)
            if(trade.OrderDelete(gIctOrder)) gIctOrder = 0;
        }
      else gIctOrder = 0;                                        // биелсэн
     }
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !IsMine(ticket)) continue;
      if(PositionGetString(POSITION_COMMENT) != "xau-ict") continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      datetime utc = opened - ServerUtcOffset(opened) * 3600;
      MqlDateTime u;
      TimeToStruct(utc, u);
      if(TimeCurrent() >= opened - (u.hour * 3600 + u.min * 60 + u.sec) + 20 * 3600) trade.PositionClose(ticket);
     }
  }

void IctPlace(const int kz, const int dir, double entry, double stop, double tp)
  {
   double lots = RuleLots();
   if(lots <= 0) return;
   if(SpreadPoints() > MaxSpreadPoints) return;
   if(!GateCheck(dir)) return;                                   // орох шүүлтүүр (TesterGate)
   entry = PriceNear(entry); stop = PriceNear(stop); tp = PriceNear(tp);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double minDist = StopsMin();
   if(MathAbs(entry - stop) < minDist || MathAbs(tp - entry) < minDist) return;   // stops level-ээс ойр: брокер татгалзана
   bool ok = false;
   if(dir > 0)
     {
      if(entry >= ask - minDist) return;                         // үнэ аль хэдийн орох түвшинд/доор: алгасна
      ok = trade.BuyLimit(lots, entry, _Symbol, stop, tp, ORDER_TIME_GTC, 0, "xau-ict") && TradeOk();
     }
   else
     {
      if(entry <= bid + minDist) return;
      ok = trade.SellLimit(lots, entry, _Symbol, stop, tp, ORDER_TIME_GTC, 0, "xau-ict") && TradeOk();
     }
   if(!ok) return;
   gIctOrder = trade.ResultOrder();
   gIctOrderEnd = gIctDayStart + (kz == 0 ? 10 : 15) * 3600;
   gIctOrderTp = tp;
   gIctOrderDir = dir;
   gKzUsed[kz] = true;
   IctResetSetup();
  }

void IctTryArm(const int kz, const double fvgTop, const double fvgBot, const double atr)
  {
   int dir = gSetDir;
   double leg = MathAbs(gLegExt - gSweepExt);
   if(leg <= 0) return;
   double o62 = gLegExt - dir * 0.62 * leg, o79 = gLegExt - dir * 0.79 * leg, o705 = gLegExt - dir * 0.705 * leg;
   double oteHi = MathMax(o62, o79), oteLo = MathMin(o62, o79);
   double entry;
   if(IctVariant(2))      entry = (dir > 0) ? fvgTop : fvgBot;   // FVG-ийн ойрын ирмэг
   else if(IctVariant(3)) entry = o705;                          // OTE 70.5%
   else
     {
      double lo = MathMax(fvgBot, oteLo), hi = MathMin(fvgTop, oteHi);
      if(lo > hi) return;                                        // FVG ба OTE давхцахгүй
      entry = (dir > 0) ? hi : lo;
     }
   double mid = (gPdh + gPdl) / 2.0;                             // premium / discount
   if(!IctVariant(7) && ((dir > 0 && entry > mid) || (dir < 0 && entry < mid))) return;
   if(IctVariant(4) && ((dir > 0 && gSweepExt >= gVal) || (dir < 0 && gSweepExt <= gVah))) return;   // sweep value area-гийн гадна
   double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double stop = gSweepExt - dir * (0.1 * atr + spread);
   double risk = dir * (entry - stop);
   if(risk <= 0) return;
   // Target: авагдаагүй хамгийн ойрын эсрэг liquidity. 2R-аас ойр бол орохгүй; байхгүй бол 2R.
   double cands[2];
   int nc = 0;
   if(dir > 0) { if(!gPdhTaken) cands[nc++] = gPdh; if(!gAsiaHTaken) cands[nc++] = gAsiaH; }
   else        { if(!gPdlTaken) cands[nc++] = gPdl; if(!gAsiaLTaken) cands[nc++] = gAsiaL; }
   double best = 0, bestDist = 0;
   for(int i = 0; i < nc; i++)
     {
      double d = dir * (cands[i] - entry);
      if(d > 0 && (bestDist == 0 || d < bestDist)) { best = cands[i]; bestDist = d; }
     }
   double tp;
   if(bestDist > 0) { if(bestDist < 2.0 * risk) return; tp = best; }
   else tp = entry + dir * 2.0 * risk;
   IctPlace(kz, dir, entry, stop, tp);
  }

// Шинэ M5 лаа хаагдах бүрт шийднэ
void IctStep()
  {
   IctManageOrders();
   datetime bar = iTime(_Symbol, PERIOD_M5, 0);
   if(bar == gIctLastBar) return;
   gIctLastBar = bar;
   datetime t1 = iTime(_Symbol, PERIOD_M5, 1);
   if(t1 <= 0) return;
   datetime utc = t1 - ServerUtcOffset(t1) * 3600;
   MqlDateTime u;
   TimeToStruct(utc, u);
   datetime dayStart = t1 - (u.hour * 3600 + u.min * 60 + u.sec);
   if(u.day_of_year != gIctDay)
     {
      gIctDay = u.day_of_year;
      gIctDayStart = dayStart;
      gIctLevels = PrevDayLevels(dayStart);
      gIctAsia = false;
      gPdhTaken = false; gPdlTaken = false; gAsiaHTaken = false; gAsiaLTaken = false;
      gKzUsed[0] = false; gKzUsed[1] = false;
      IctResetSetup();
     }
   if(u.day_of_week == 0 || u.day_of_week == 6 || !gIctLevels) return;
   double h = iHigh(_Symbol, PERIOD_M5, 1), l = iLow(_Symbol, PERIOD_M5, 1), c = iClose(_Symbol, PERIOD_M5, 1);
   if(u.hour < 7)
     {
      if(h > gPdh) gPdhTaken = true;                             // Азийн үеэр авагдсан түвшин sweep болохгүй
      if(l < gPdl) gPdlTaken = true;
      return;
     }
   if(!gIctAsia)
     {
      gIctAsia = AsiaRange(dayStart);
      if(!gIctAsia) return;
     }
   if(u.hour >= 15) return;                                      // Нью-Йоркийн killzone дууссан

   int bias = IctVariant(8) ? DailyTrend() : H4StructureBias();
   if(gSetDir != 0 && gSetDir != bias) IctResetSetup();

   // 1. Liquidity sweep: түвшинг өдөрт анх удаа давсан лаа
   bool sweptLow = false, sweptHigh = false;
   if(!gPdlTaken && l < gPdl)     { gPdlTaken = true; sweptLow = true; }
   if(!gAsiaLTaken && l < gAsiaL) { gAsiaLTaken = true; sweptLow = true; }
   if(!gPdhTaken && h > gPdh)     { gPdhTaken = true; sweptHigh = true; }
   if(!gAsiaHTaken && h > gAsiaH) { gAsiaHTaken = true; sweptHigh = true; }
   if(gSetDir == 0 && bias > 0 && sweptLow)  IctBeginSetup(1, t1, l);
   if(gSetDir == 0 && bias < 0 && sweptHigh) IctBeginSetup(-1, t1, h);
   if(gSetDir == 0) return;

   // Шинэ оргил гарвал импульс, MSS-ийг дахин хүлээнэ
   if(gSetDir > 0)
     {
      if(t1 > gSweepTime && l < gSweepExt) { gSweepExt = l; gLegExt = h; gMss = false; }
      else gLegExt = MathMax(gLegExt, h);
     }
   else
     {
      if(t1 > gSweepTime && h > gSweepExt) { gSweepExt = h; gLegExt = l; gMss = false; }
      else gLegExt = MathMin(gLegExt, l);
     }

   // 2. MSS: хаалт sweep-ээс өмнөх swing-ийг эвдсэн
   if((gSetDir > 0 && c > gMssLevel) || (gSetDir < 0 && c < gMssLevel)) gMss = true;

   // 3. Killzone дотор MSS-ийн дараа үүссэн FVG (лаа 3, 2, 1)
   int kz = (u.hour >= 7 && u.hour < 10) ? 0 : ((u.hour >= 12 && u.hour < 15) ? 1 : -1);
   if(kz < 0 || gKzUsed[kz]) return;
   if((IctVariant(5) && kz != 0) || (IctVariant(6) && kz != 1)) return;
   if(!gMss || IctHasExposure()) return;
   if(iTime(_Symbol, PERIOD_M5, 3) < gSweepTime) return;
   double h3 = iHigh(_Symbol, PERIOD_M5, 3), l3 = iLow(_Symbol, PERIOD_M5, 3);
   double body2 = MathAbs(iClose(_Symbol, PERIOD_M5, 2) - iOpen(_Symbol, PERIOD_M5, 2));
   double atr = Buf(hM5Atr, 2);
   if(atr == EMPTY_VALUE || atr <= 0 || body2 < atr) return;   // displacement
   if(gSetDir > 0) { if(l <= h3) return; IctTryArm(kz, l, h3, atr); }
   else            { if(h >= l3) return; IctTryArm(kz, l3, h, atr); }
  }

//+------------------------------------------------------------------+
//| SMC Active (Strategy Tester).                                     |
//| Бүтэц эвдэрмэгц (breakout) шууд орно, QM (Quasimodo)-ийн зүүн     |
//| мөрөнд limit тавина. TP: хамгийн ойрын эвдэгдээгүй BSL / SSL.     |
//| Дүрэм: claude/trader-smc-active-preregistration.md                |
//+------------------------------------------------------------------+
bool SxVar(const int v) { return(TesterIctVariant == v); }
ENUM_TIMEFRAMES SxTf() { return(SxVar(8) ? PERIOD_M15 : PERIOD_M5); }

bool SwHigh(const MqlRates &r[], const int k) { return(r[k].high > r[k-1].high && r[k].high > r[k-2].high && r[k].high > r[k+1].high && r[k].high > r[k+2].high); }
bool SwLow(const MqlRates &r[], const int k)  { return(r[k].low < r[k-1].low && r[k].low < r[k-2].low && r[k].low < r[k+1].low && r[k].low < r[k+2].low); }

// Нээлттэй арилжаа + хүлээгдэж буй захиалгын тоо
int SxCountOpen()
  {
   int n = CountPositions();
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == MagicNumber && OrderGetString(ORDER_SYMBOL) == _Symbol) n++;
     }
   return(n);
  }

// Limit захиалга: 2 цагт биелээгүй эсвэл TP түрүүлж хүрвэл цуцална. Баасан 20:00 UTC-д бүгдийг хаана.
void SxManage()
  {
   datetime now = TimeCurrent();
   MqlDateTime u;
   TimeToStruct(now - ServerUtcOffset(now) * 3600, u);
   bool weekend = (u.day_of_week == 5 && u.hour >= 20);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) != MagicNumber || OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      double tp = OrderGetDouble(ORDER_TP);
      bool buy = (OrderGetInteger(ORDER_TYPE) == ORDER_TYPE_BUY_LIMIT);
      bool reached = buy ? (tp > 0 && bid >= tp) : (tp > 0 && ask <= tp);
      if(weekend || reached || now - (datetime)OrderGetInteger(ORDER_TIME_SETUP) >= 2 * 3600) trade.OrderDelete(t);
     }
   if(weekend && CountPositions() > 0) CloseAllMine();
   if(TesterManage) SxTrailAll();
  }

// TP = орох үнээс minR·R-аас багагүй зайтай хамгийн ойрын liquidity; олдохгүй бол 2R
void SxEnter(const int dir, const double entry, const double stop, const double &lv[], const int cnt, const double minR, const double atr, const bool limit, const string tag)
  {
   double risk = dir * (entry - stop);
   if(risk <= 0 || risk > 3.0 * atr) return;
   double tp = 0, bestD = 0;
   for(int i = 0; i < cnt; i++)
     {
      double d = dir * (lv[i] - entry);
      if(d >= minR * risk && (bestD == 0 || d < bestD)) { bestD = d; tp = lv[i]; }
     }
   if(bestD == 0) tp = entry + dir * 2.0 * risk;
   double lots = RuleLots();
   if(lots <= 0) return;
   if(SpreadPoints() > MaxSpreadPoints) return;
   if(!GateCheck(dir)) return;                                   // орох шүүлтүүр (TesterGate)
   double minDist = StopsMin();
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = PriceNear(stop), t = PriceNear(tp), e = PriceNear(entry);
   string cm = tag + ":" + DoubleToString(risk, 2);                // анхны R-ийг тэмдэглэнэ (BE, trailing-д)
   if(!limit)
     {
      // BUY-ийн stop/target-ийг Bid-ээс, SELL-ийнхийг Ask-аас хэмжинэ
      if(dir > 0) { if(bid - sl <= minDist || t - bid <= minDist) return; if(!trade.Buy(lots, _Symbol, 0.0, sl, t, cm) || !TradeOk()) Print("XauBot: SMC ", trade.ResultRetcodeDescription()); }
      else        { if(sl - ask <= minDist || ask - t <= minDist) return; if(!trade.Sell(lots, _Symbol, 0.0, sl, t, cm) || !TradeOk()) Print("XauBot: SMC ", trade.ResultRetcodeDescription()); }
      return;
     }
   if(MathAbs(e - sl) < minDist || MathAbs(t - e) < minDist) return;
   if(dir > 0) { if(e >= ask - minDist) return; if(!trade.BuyLimit(lots, e, _Symbol, sl, t, ORDER_TIME_GTC, 0, cm) || !TradeOk()) Print("XauBot: SMC ", trade.ResultRetcodeDescription()); }
   else        { if(e <= bid + minDist) return; if(!trade.SellLimit(lots, e, _Symbol, sl, t, ORDER_TIME_GTC, 0, cm) || !TradeOk()) Print("XauBot: SMC ", trade.ResultRetcodeDescription()); }
  }

void SxStep()
  {
   SxManage();
   ENUM_TIMEFRAMES tf = SxTf();
   datetime bar = iTime(_Symbol, tf, 0);
   if(bar == gSxLastBar) return;
   gSxLastBar = bar;
   datetime t1 = iTime(_Symbol, tf, 1);
   if(t1 <= 0) return;
   MqlDateTime u;
   TimeToStruct(t1 - ServerUtcOffset(t1) * 3600, u);
   datetime dayStart = t1 - (u.hour * 3600 + u.min * 60 + u.sec);
   double bh = iHigh(_Symbol, tf, 1), bl = iLow(_Symbol, tf, 1);
   if(u.day_of_year != gSxDay)
     {
      gSxDay = u.day_of_year;
      gSxLevels = PrevDayLevels(dayStart);
      gIctAsia = false;
      gSxDayHi = bh; gSxDayLo = bl; gSxPostHi = 0; gSxPostLo = 0;
     }
   else { gSxDayHi = MathMax(gSxDayHi, bh); gSxDayLo = MathMin(gSxDayLo, bl); }
   if(u.hour >= 7)
     {
      if(!gIctAsia) gIctAsia = AsiaRange(dayStart);
      if(gSxPostHi == 0) { gSxPostHi = bh; gSxPostLo = bl; }
      else { gSxPostHi = MathMax(gSxPostHi, bh); gSxPostLo = MathMin(gSxPostLo, bl); }
     }
   if(u.day_of_week == 0 || u.day_of_week == 6 || !gSxLevels) return;
   if(u.hour >= 21 || u.hour < 1) return;                        // шөнийн rollover-ийн үед орохгүй
   if(u.day_of_week == 5 && u.hour >= 19) return;
   if(SxVar(6) && (u.hour < 7 || u.hour >= 17)) return;          // зөвхөн Лондон + Нью-Йорк
   if(SxCountOpen() >= 3) return;

   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, tf, 1, 300, r);                    // хаагдсан лаанууд, хуучнаас шинэ
   if(n < 50) return;
   int last = n - 1;
   double atr = Buf(SxVar(8) ? hM15Atr : hM5Atr, 1);
   if(atr == EMPTY_VALUE || atr <= 0) return;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double buf = 0.1 * atr + (ask - bid);
   double minR = SxVar(4) ? 0.5 : (SxVar(5) ? 1.5 : 1.0);

   // Эвдэгдээгүй swing-ууд = BSL (дээр), SSL (доор)
   double sufH[], sufL[];
   ArrayResize(sufH, n + 1); ArrayResize(sufL, n + 1);
   sufH[n] = -DBL_MAX; sufL[n] = DBL_MAX;
   for(int k = n - 1; k >= 0; k--) { sufH[k] = MathMax(sufH[k + 1], r[k].high); sufL[k] = MathMin(sufL[k + 1], r[k].low); }
   double bsl[], ssl[];
   ArrayResize(bsl, n + 4); ArrayResize(ssl, n + 4);
   int nb = 0, ns = 0, ksH = -1, ksL = -1;
   for(int k = 2; k <= n - 3; k++)
     {
      if(SwHigh(r, k)) { ksH = k; if(sufH[k + 1] < r[k].high) bsl[nb++] = r[k].high; }
      if(SwLow(r, k))  { ksL = k; if(sufL[k + 1] > r[k].low)  ssl[ns++] = r[k].low; }
     }
   if(gSxDayHi < gPdh) bsl[nb++] = gPdh;                         // өмнөх өдрийн high/low
   if(gSxDayLo > gPdl) ssl[ns++] = gPdl;
   if(gIctAsia && u.hour >= 7)                                   // Азийн high/low
     {
      if(gSxPostHi < gAsiaH) bsl[nb++] = gAsiaH;
      if(gSxPostLo > gAsiaL) ssl[ns++] = gAsiaL;
     }
   int bias = SxVar(7) ? H4StructureBias() : 0;

   // BUY: сүүлийн swing high-ийг анх удаа биеээрээ хаалтаар эвдсэн
   if(ksH >= 0 && (!SxVar(7) || bias > 0))
     {
      double lvl = r[ksH].high;
      bool first = r[last].close > lvl && r[last].close > r[last].open;
      for(int j = ksH + 1; j < last && first; j++) if(r[j].close > lvl) first = false;
      if(first)
        {
         if(!SxVar(3) && gSxBosUp != r[ksH].time && SxCountOpen() < 3)
           {
            gSxBosUp = r[ksH].time;
            double lo = sufL[ksH];                               // эвдсэн хөлийн хамгийн нам цэг
            SxEnter(1, ask, lo - buf, bsl, nb, minR, atr, false, "xau-bos");
           }
         if(!SxVar(2) && SxCountOpen() < 3)
           {
            int k1 = -1, k2 = -1;                                // QM: L1 (зүүн мөр) < H1 < L2 (толгой, L1-ээс доош) < эвдрэл
            for(int k = ksH - 1; k >= 2; k--) if(SwLow(r, k)) { k1 = k; break; }
            for(int k = n - 3; k > ksH; k--) if(SwLow(r, k)) { k2 = k; break; }
            if(k1 >= 0 && k2 >= 0 && r[k2].low < r[k1].low && gSxQmUp != r[k2].time)
              {
               gSxQmUp = r[k2].time;
               SxEnter(1, r[k1].low, r[k2].low - buf, bsl, nb, minR, atr, true, "xau-qm");
              }
           }
        }
     }
   // SELL: эсрэгээр
   if(ksL >= 0 && (!SxVar(7) || bias < 0))
     {
      double lvl = r[ksL].low;
      bool first = r[last].close < lvl && r[last].close < r[last].open;
      for(int j = ksL + 1; j < last && first; j++) if(r[j].close < lvl) first = false;
      if(first)
        {
         if(!SxVar(3) && gSxBosDn != r[ksL].time && SxCountOpen() < 3)
           {
            gSxBosDn = r[ksL].time;
            double hi = sufH[ksL];
            SxEnter(-1, bid, hi + buf, ssl, ns, minR, atr, false, "xau-bos");
           }
         if(!SxVar(2) && SxCountOpen() < 3)
           {
            int k1 = -1, k2 = -1;
            for(int k = ksL - 1; k >= 2; k--) if(SwHigh(r, k)) { k1 = k; break; }
            for(int k = n - 3; k > ksL; k--) if(SwHigh(r, k)) { k2 = k; break; }
            if(k1 >= 0 && k2 >= 0 && r[k2].high > r[k1].high && gSxQmDn != r[k2].time)
              {
               gSxQmDn = r[k2].time;
               SxEnter(-1, r[k1].high, r[k2].high + buf, ssl, ns, minR, atr, true, "xau-qm");
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Break-even + trailing stop: найзын BuySellStop Pro v5-ийн логик.  |
//| Үнэ beTrig-ээр ашигт гармагц stop-ыг орох үнэ + beLock руу,       |
//| trStart-аас хойш үнийг trDist зайтай дагана (trStep алхмаар).     |
//+------------------------------------------------------------------+
void TrailOne(const ulong ticket, const double beTrig, const double beLock, const double trStart, const double trDist, const double trStep)
  {
   if(!PositionSelectByTicket(ticket)) return;
   bool buy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
   double open = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
   double px = buy ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(buy)
     {
      if(px >= open + beTrig)
        {
         double nsl = NormalizeDouble(open + beLock, _Digits);
         if(sl < nsl && trade.PositionModify(ticket, nsl, tp)) sl = nsl;
        }
      if(px >= open + trStart)
        {
         double nsl = NormalizeDouble(px - trDist, _Digits);
         if(nsl > sl + trStep) trade.PositionModify(ticket, nsl, tp);
        }
     }
   else
     {
      if(px <= open - beTrig)
        {
         double nsl = NormalizeDouble(open - beLock, _Digits);
         if((sl == 0 || sl > nsl) && trade.PositionModify(ticket, nsl, tp)) sl = nsl;
        }
      if(px <= open - trStart)
        {
         double nsl = NormalizeDouble(px + trDist, _Digits);
         if(sl == 0 || nsl < sl - trStep) trade.PositionModify(ticket, nsl, tp);
        }
     }
  }

// Ашигтай арилжааг хамгаална (вэбийн "protect"): анхны эрсдэлийн зай R-ийг арилжааны тайлбараас уншина.
// +1R хүрэхэд stop-ийг орсон үнээс +0.1R рүү (алдагдалгүй), +1.5R-ээс эхлэн үнийг 1R зайтай дагуулна.
void ProtectAll()
  {
   if(!gProtect) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsMine(t)) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      if(StringFind(cm, "xau-bot:") != 0) continue;
      double R = StringToDouble(StringSubstr(cm, 8));
      if(R <= 0) continue;
      TrailOne(t, 1.0 * R, 0.1 * R, 1.5 * R, 1.0 * R, 0.2 * R);
     }
  }

// SMC Active: найзын харьцааг ($1 stop-д 0.8 / 0.1 / 1.0 / 0.8 / 0.15) арилжааны анхны R-д тааруулна
void SxTrailAll()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsMine(t)) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int at = StringFind(cm, ":");
      if(at < 0) continue;
      double R = StringToDouble(StringSubstr(cm, at + 1));
      if(R <= 0) continue;
      TrailOne(t, 0.8 * R, 0.1 * R, 1.0 * R, 0.8 * R, 0.15 * R);
     }
  }

//+------------------------------------------------------------------+
//| Straddle: найзын BuySellStop Pro v5 (тасралтгүй горим)-ийг        |
//| анхны тохиргоогоор нь. Үнээс ±$1.5 зайд Buy Stop / Sell Stop,     |
//| SL $1, TP байхгүй. Нэг нь биелмэгц нөгөөг цуцална (OCO).          |
//| 120 сек биелэхгүй бол цуцалж шинээр тавина; үнэ холдвол дагуулна. |
//| Spread $0.50-аас их бол тавихгүй. BE +0.8 / +0.1, trailing 1.0 / 0.8.|
//+------------------------------------------------------------------+
void StDeletePending()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == MagicNumber && OrderGetString(ORDER_SYMBOL) == _Symbol) trade.OrderDelete(t);
     }
  }

void StPlace()
  {
   double lots = RuleLots();
   if(lots <= 0) return;
   if(!GateCheck(0)) return;                                     // орох шүүлтүүр, чиглэлгүй хэсэг (TesterGate)
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double b = PriceUp(ask + 1.5), sv = PriceDown(bid - 1.5);
   if(!trade.BuyStop(lots, b, _Symbol, PriceDown(b - 1.0), 0.0, ORDER_TIME_GTC, 0, "xau-straddle") || !TradeOk()) return;
   if(!trade.SellStop(lots, sv, _Symbol, PriceUp(sv + 1.0), 0.0, ORDER_TIME_GTC, 0, "xau-straddle") || !TradeOk())
     {
      StDeletePending();                                         // ганц талтай үлдээхгүй
      return;
     }
   gStPlaced = TimeCurrent();
  }

void StStep()
  {
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(CountPositions() > 0)
     {
      StDeletePending();                                         // OCO
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t != 0 && IsMine(t)) TrailOne(t, 0.8, 0.1, 1.0, 0.8, 0.15);
        }
      return;
     }
   if(ask - bid > 0.50) return;                                  // spread шүүлтүүр
   int nb = 0, ns = 0;
   double pb = 0, ps = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) != MagicNumber || OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(OrderGetInteger(ORDER_TYPE) == ORDER_TYPE_BUY_STOP)  { nb++; pb = OrderGetDouble(ORDER_PRICE_OPEN); }
      if(OrderGetInteger(ORDER_TYPE) == ORDER_TYPE_SELL_STOP) { ns++; ps = OrderGetDouble(ORDER_PRICE_OPEN); }
     }
   if(nb > 0 || ns > 0)
     {
      if(gStPlaced > 0 && TimeCurrent() - gStPlaced >= 120) { StDeletePending(); gStPlaced = 0; return; }
      if(nb == 1 && ns == 1 && (MathAbs(pb - (ask + 1.5)) > 0.9 || MathAbs(ps - (bid - 1.5)) > 0.9))
        {
         StDeletePending();
         StPlace();
        }
      return;
     }
   StPlace();
  }

//+------------------------------------------------------------------+
//| Азийн breakout бодит цагт (вэбээс Start дарсан үед)               |
//| Tester дээр шалгасан Дүрэм 1-тэй ижил шийдвэр. Төлөвөө түүхээс    |
//| уншдаг тул MT5 дахин ассан ч өдрийн арилжаагаа давхар нээхгүй.    |
//+------------------------------------------------------------------+
bool RuleTradedSince(const datetime from)
  {
   if(!HistorySelect(from, TimeCurrent() + 60)) return(false);
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
      if(HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      string cm = HistoryDealGetString(t, DEAL_COMMENT);
      if(cm == "xau-rule" || StringFind(cm, "xau-r:") == 0) return(true);
     }
   return(false);
  }

// Дүрмийн арилжааг нээсэн өдрийнх нь 20:00 UTC-д хаана
void AsianTimeExit()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !IsMine(ticket)) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      if(StringFind(cm, "xau-r:") == 0)
        {
         string rest = StringSubstr(cm, 6);
         int colon = StringFind(rest, ":");                                // v3.70: "xau-r:<хаах цаг>:<захиалгын id>"
         datetime own = (datetime)StringToInteger(colon > 0 ? StringSubstr(rest, 0, colon) : rest);   // нээхдээ хадгалсан хаах цаг
         if(own > 0 && TimeCurrent() >= own) trade.PositionClose(ticket);
         continue;
        }
      if(cm != "xau-rule") continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      datetime utc = opened - ServerUtcOffset(opened) * 3600;
      MqlDateTime u;
      TimeToStruct(utc, u);
      datetime exitAt = opened - (u.hour * 3600 + u.min * 60 + u.sec) + 20 * 3600;
      if(TimeCurrent() >= exitAt) trade.PositionClose(ticket);
     }
  }

// Захиалгын id: дүрмийн дугаар × 1e10 + лааны хаалтын unix секунд. Дүрэм бүр сүүлд орсон id-гаа санана.
#define ORDER_RULE_STEP 10000000000
string OrderGlobal(const long id) { return("xau_ord_" + IntegerToString(id / ORDER_RULE_STEP)); }

bool EndsWith(const string s, const string tail)
  {
   int n = StringLen(s), k = StringLen(tail);
   return(n >= k && StringSubstr(s, n - k) == tail);
  }

// Энэ захиалгаар аль хэдийн орсон уу: дүрмийн тэмдэглэл, хуучин файлын тэмдэглэл, нээлттэй арилжаа эсвэл
// сүүлийн 3 хоногийн оролтын comment-д id байвал тийм. Хариу хоцорсон (timeout) захиалгыг давхар нээхгүй.
bool OrderTaken(const long id)
  {
   string g = OrderGlobal(id);
   if(GlobalVariableCheck(g) && (long)GlobalVariableGet(g) == id) return(true);
   if(id / ORDER_RULE_STEP == 0 && GlobalVariableCheck("xau_asian_last") && (long)GlobalVariableGet("xau_asian_last") == id % ORDER_RULE_STEP) return(true);
   string tag = ":" + IntegerToString(id);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsMine(t)) continue;
      if(EndsWith(PositionGetString(POSITION_COMMENT), tag)) return(true);
     }
   if(HistorySelect(TimeCurrent() - 3 * 86400, TimeCurrent() + 60))
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
        {
         ulong t = HistoryDealGetTicket(i);
         if(t == 0) continue;
         if(HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber || HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
         if(HistoryDealGetInteger(t, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         if(EndsWith(HistoryDealGetString(t, DEAL_COMMENT), tag)) return(true);
        }
   return(false);
  }

void MarkTaken(const long id)
  {
   GlobalVariableSet(OrderGlobal(id), (double)id);
   if(id / ORDER_RULE_STEP == 0) { gDLast = id % ORDER_RULE_STEP; GlobalVariableSet("xau_asian_last", (double)gDLast); }
  }

// Зах зээлийн захиалга, stop ба target нь үнээр (сайтын setup-ийн өөрийн түвшин). Stops level-ээс ойр бол түүнд хүртэл холдуулна.
bool SendMarketAt(const int dir, const double lots, const double slPrice, const double tpPrice, const string cm)
  {
   if(lots <= 0 || dir == 0) return(false);
   for(int attempt = 0; attempt < 2; attempt++)
     {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(ask <= 0 || bid <= 0) return(false);
      double minD = StopsMin();
      bool sent;
      if(dir > 0) sent = trade.Buy(lots, _Symbol, 0.0, PriceDown(MathMin(slPrice, bid - minD)), PriceUp(MathMax(tpPrice, bid + minD)), cm);
      else        sent = trade.Sell(lots, _Symbol, 0.0, PriceUp(MathMax(slPrice, ask + minD)), PriceDown(MathMin(tpPrice, ask - minD)), cm);
      if(sent && TradeOk()) { gStatsAt = 0; return(true); }
      uint rc = trade.ResultRetcode();
      if(rc != TRADE_RETCODE_REQUOTE && rc != TRADE_RETCODE_PRICE_CHANGED && rc != TRADE_RETCODE_PRICE_OFF) break;
     }
   return(false);
  }

// Захиалгын хаах цаг серверийн цагаар: вэбийнх (UTC unix секунд), эс бөгөөс өнөөдрийн 20:00 UTC
datetime OrderExitAt(const long exitUtc)
  {
   datetime now = TimeCurrent();
   if(exitUtc > 0) return((datetime)(exitUtc + ServerUtcOffset(now) * 3600));
   MqlDateTime u;
   TimeToStruct(now - ServerUtcOffset(now) * 3600, u);
   return(now - (u.hour * 3600 + u.min * 60 + u.sec) + 20 * 3600);
  }

// Нэг захиалгыг сайтын дүрмээр яг тэр чигээр нь авна: шүүлтүүр, хамгаалалт, өдрийн хязгааргүй; зөвхөн лот, эрсдэлийн
// хэмжээ. Stop, target нь үнээр. Үнэ орох түвшнээс gOSlipR R-ээс илүү явсан, stop-ийг давсан бол орохгүй.
// Буцаах: "" орсон, эс бөгөөс шалтгаан.
string TakeOrder(const long id, const int dir, const double entry, const double sl, const double tp, const int age, const long exitUtc, const double mul = 1.0)
  {
   if(OrderTaken(id)) return(L("энэ дохиогоор орсон", "this signal was taken"));
   if(age > gOMaxAge) return(L("дохио ", "signal older than ") + (string)(gOMaxAge / 60) + L(" минутаас хуучин", " minutes"));
   double risk = MathAbs(entry - sl);
   if(risk <= 0 || dir == 0) return(L("захиалгын түвшин буруу", "bad order levels"));
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask <= 0 || bid <= 0) return(L("үнэ алга", "no price"));
   if(dir > 0 ? bid <= sl : ask >= sl) return(L("үнэ stop-ийг давсан", "price is past the stop"));
   double ran = dir * ((dir > 0 ? ask : bid) - entry) / risk;
   if(ran > gOSlipR) return(L("үнэ орох түвшнээс ", "price already ran ") + Num(ran, 2) + L("R явчихсан", "R past the entry"));
   double slD = (dir > 0) ? ask - sl : sl - bid, tpD = (dir > 0) ? tp - ask : bid - tp;
   if(slD <= StopsMin() || tpD <= StopsMin()) return(L("stop эсвэл target хэт ойр", "stop or target too close"));
   datetime exitAt = OrderExitAt(exitUtc);
   if(TimeCurrent() >= exitAt) return(L("хаах цаг өнгөрсөн", "past the closing time"));
   double lots = RuleLots(), s1 = slD, t1 = tpD;
   if(!SizeTrade(s1, t1, lots, false) || lots <= 0) return(L("хэмжээ: ", "size: ") + GateText(gBlock));
   lots = ApplyMul(lots, mul * (SameDirOpen(dir) ? SAME_DIR_MUL : 1.0));   // трендийн хүч; ижил чиглэлд нээлттэй бол хагас
   if(TimeCurrent() - gOrderTryAt < EntryCooldownSeconds) return(L("өмнөх захиалгын хариуг хүлээж байна", "waiting for the last order's reply"));
   gOrderTryAt = TimeCurrent();
   // Хаах цаг ба захиалгын id comment-д: дахин ачаалсан ч хаах цагаа мэдэж, нэг захиалгаар хоёр удаа орохгүй
   if(!SendMarketAt(dir, lots, sl, tp, "xau-r:" + IntegerToString((long)exitAt) + ":" + IntegerToString(id)))
      return(L("захиалга амжилтгүй: ", "order failed: ") + trade.ResultRetcodeDescription());
   MarkTaken(id);
   Print(L("XauBot: setup-ийн захиалга — ", "XauBot: setup order — "), (dir > 0 ? "BUY" : "SELL"), L(" лот ", " lots "), Num(lots, 2), " SL ", Num(sl, 2), " TP ", Num(tp, 2), " id ", IntegerToString(id));
   return("");
  }

// Шинэ оролт хийх боломжгүй шалтгаан (бүх захиалгад нэг), "" = боломжтой
string EntryBlockedWhy()
  {
   if(gState != "RUNNING") return(L("зогссон", "stopped"));
   if(CountPositions() >= 3) return(L("3 арилжаа нээлттэй байна", "three trades already open"));   // сешн бүрт нэг: Ази, NY нээлт, NY хоёр дахь цаг
   if(RealBlocked()) return(L("жинхэнэ данс зөвшөөрөгдөөгүй", "real account not allowed"));
   if(TimeLocal() - gLastSyncOk > 30) return(L("вэбтэй холбоо тасарсан", "the web connection was lost"));
   if(!TradingAllowed()) return(L("Algo Trading унтраалттай эсвэл брокер арилжаа хаасан", "Algo Trading is off or the broker has closed trading"));
   if(RuleLots() <= 0 && gRiskMode == 0) return(L("лот брокерын доод хэмжээнээс бага", "lots are below the broker's minimum"));
   if(SpreadPoints() > MaxSpreadPoints) return(L("spread хэт өргөн", "spread too wide"));
   return("");
  }

void LiveAsianStep()
  {
   // Сайтын Setup хуудас, Telegram дохиотой яг ижил дүрэм: вэб breakout-ыг шийдэж (тренд, мэдээ, хүрээ), сешн бүрийн
   // идэвхтэй setup-ийг үнийн түвшинтэй нь илгээнэ. Робот зөвхөн захиалгыг тавьж, setup-ийн хаах цагт хаана.
   if(gDLast < 0) gDLast = GlobalVariableCheck("xau_asian_last") ? (long)GlobalVariableGet("xau_asian_last") : 0;
   if(WeekendQuiet()) { gSignal = "NONE"; gReason = L("Амралтын өдөр, зах хаалттай", "Weekend, market closed"); return; }
   if(!gHasOrders) { LegacyAsianStep(); return; }
   if(gOrders == "")
     {
      gSignal = "NONE";
      gReason = L("Сайтын setup дохиог хүлээж байна (Ази, Нью-Йорк · Setup хуудас)", "Waiting for the site's setup signal (Asia, New York · Setup page)");
      return;
     }
   string list[];
   int n = StringSplit(gOrders, ';', list);
   gSignal = "NONE";
   gReason = "";
   string blocked = EntryBlockedWhy();
   for(int i = 0; i < n; i++)
     {
      string f[];
      if(StringSplit(list[i], ',', f) < 7) continue;
      long id = StringToInteger(f[0]);
      int dir = (int)StringToInteger(f[1]);
      double entry = StringToDouble(f[2]), sl = StringToDouble(f[3]), tp = StringToDouble(f[4]);
      int age = (int)StringToInteger(f[5]);
      long exitUtc = StringToInteger(f[6]);
      double mul = (ArraySize(f) >= 8) ? StringToDouble(f[7]) : 1.0;   // v3.80: трендийн хүчээр лотын коэффициент
      if(id <= 0 || dir == 0) continue;
      string side = (dir > 0) ? "BUY" : "SELL";
      if(gSignal == "NONE") gSignal = side;
      string why = (blocked != "") ? blocked : TakeOrder(id, dir, entry, sl, tp, age, exitUtc, mul);
      if(blocked == "" && why == "") blocked = EntryBlockedWhy();             // орсны дараа нээлттэй арилжааны тоо өөрчлөгдөнө
      gReason += (gReason == "" ? "" : " | ") + L("Setup: ", "Setup: ") + side + " " + Num(entry, 2) + " SL " + Num(sl, 2) + " TP " + Num(tp, 2) + " · " + (why == "" ? L("орлоо", "entered") : why);
     }
   if(gReason == "") gReason = L("Сайтын setup дохиог хүлээж байна", "Waiting for the site's setup signal");
  }

// Хуучин сервер (orders талбаргүй): нэг захиалга, stop/target зайгаар. Шүүлтүүргүй, зөвхөн лот, эрсдэлийн хэмжээ.
void LegacyAsianStep()
  {
   if(gDId <= 0 || gDDir == 0)
     {
      gSignal = "NONE";
      gReason = L("Сайтын setup дохиог хүлээж байна (Ази, Нью-Йорк · Setup хуудас)", "Waiting for the site's setup signal (Asia, New York · Setup page)");
      return;
     }
   gSignal = (gDDir > 0) ? "BUY" : "SELL";
   gReason = L("Setup: ", "Setup: ") + gSignal + ", stop $" + Num(gDRisk, 2) + ", RR " + Num(gDRR, 1);
   if(gDId == gDLast) { gReason += L(" · энэ дохиогоор орсон", " · this signal was taken"); return; }
   if(gDAge > 900) { gReason += L(" · дохио 15 минутаас хуучин, орохгүй", " · signal older than 15 minutes, no entry"); return; }
   string blocked = EntryBlockedWhy();
   if(blocked != "") { gReason += " · " + blocked; return; }
   if(gDRisk <= StopsMin()) { gReason += L(" · stop хэт ойр тул орсонгүй", " · no entry: the stop would be too close"); return; }
   datetime exitAt = OrderExitAt(gDExit);
   if(TimeCurrent() >= exitAt) { gReason += L(" · хаах цаг өнгөрсөн", " · past the closing time"); return; }
   double lots = RuleLots(), sl = gDRisk, tp = gDRisk * gDRR;
   if(!SizeTrade(sl, tp, lots, false) || lots <= 0) { gReason += L(" · хэмжээ: ", " · size: ") + GateText(gBlock); return; }
   if(TimeCurrent() - gOrderTryAt < EntryCooldownSeconds) return;
   gOrderTryAt = TimeCurrent();
   if(SendMarket(gDDir, lots, sl, tp, "xau-r:" + IntegerToString((long)exitAt) + ":" + IntegerToString(gDId)))
     {
      gDLast = gDId;
      GlobalVariableSet("xau_asian_last", (double)gDId);
      gReason += L(" · орлоо", " · entered");
     }
   else
      gReason += L(" · захиалга амжилтгүй: ", " · order failed: ") + trade.ResultRetcodeDescription();
  }

//+------------------------------------------------------------------+
//| JSON туслахууд (хариу нь хавтгай бүтэцтэй)                       |
//+------------------------------------------------------------------+
string JRaw(const string body, const string key)
  {
   string k = "\"" + key + "\":";
   int p = StringFind(body, k);
   if(p < 0) return("");
   p += StringLen(k);
   int e1 = StringFind(body, ",", p);
   int e2 = StringFind(body, "}", p);
   int e = (e1 < 0) ? e2 : ((e2 < 0) ? e1 : MathMin(e1, e2));
   if(e < 0) e = StringLen(body);
   return(StringSubstr(body, p, e - p));
  }

// Брокерын серверийн нэрийг JSON-д аюулгүй болгох: хашилт, ташуу зураасыг авч хаяна
string JsonSafe(string v)
  {
   StringReplace(v, "\\", "");
   StringReplace(v, "\"", "");
   return(StringSubstr(v, 0, 80));
  }

// Чөлөөт бичвэрийг (шалтгаан, брокерын хариу) JSON мөр болгох: хашилт, ташуу зураасыг escape хийж, удирдах тэмдэгтийг хасна
string JsonText(string v, const int maxLen)
  {
   for(int i = StringLen(v) - 1; i >= 0; i--)                     // control characters (line breaks etc.) become spaces
      if(StringGetCharacter(v, i) < 32) StringSetCharacter(v, i, 32);
   if(StringLen(v) > maxLen) v = StringSubstr(v, 0, maxLen);
   StringReplace(v, "\\", "\\\\");
   StringReplace(v, "\"", "\\\"");
   return(v);
  }

string JStr(const string body, const string key)
  {
   string k = "\"" + key + "\":\"";
   int p = StringFind(body, k);
   if(p < 0) return("");
   p += StringLen(k);
   int e = StringFind(body, "\"", p);
   if(e < 0) return("");
   return(StringSubstr(body, p, e - p));
  }

double JNum(const string body, const string key) { return(StringToDouble(JRaw(body, key))); }
bool   JBool(const string body, const string key) { return(StringFind(JRaw(body, key), "true") == 0); }

string Num(const double v, const int digits) { return(DoubleToString(v, digits)); }

string IsoUtc(const datetime serverTime)
  {
   // Серверийн цагийн зөрүүг 15 минутаар бүхэлчилнэ: TimeGMT нь компьютерийн цагаас хамаардаг тул секундээр хэлбэлздэг
   long off = (long)MathRound((double)(TimeTradeServer() - TimeGMT()) / 900.0) * 900;
   datetime gmt = serverTime - (datetime)off;
   MqlDateTime s;
   TimeToStruct(gmt, s);
   return(StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", s.year, s.mon, s.day, s.hour, s.min, s.sec));
  }

string PositionsJson()
  {
   string out = "";
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(!IsMine(t)) continue;
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      if(out != "") out += ",";
      out += "{\"ticket\":\"" + (string)t + "\",\"side\":\"" + side + "\",\"lots\":" + Num(PositionGetDouble(POSITION_VOLUME), 2) +
             ",\"openPrice\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), _Digits) + ",\"sl\":" + Num(PositionGetDouble(POSITION_SL), _Digits) +
             ",\"tp\":" + Num(PositionGetDouble(POSITION_TP), _Digits) + ",\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2) + "}";
     }
   return(out);
  }

// v3.90: дансны хаасан бүх арилжаа — гараар хийсэн ч, өөр роботынх ч — jFrom-оос хойш, хуучнаас нь эхлэн 50 хүртэл.
// Every closed trade on the account (by hand or any robot) after the server's jFrom cursor, oldest first, for the web journal.
string JournalJson()
  {
   string out = "";
   if(!ShareJournal || gTester || gJFrom <= 0) return(out);
   if(TimeLocal() - gJournalAt < 30) return(out);
   gJournalAt = TimeLocal();
   long off = (long)MathRound((double)(TimeTradeServer() - TimeGMT()) / 900.0) * 900;
   datetime from = (datetime)(gJFrom + off);                     // серверийн цагаар
   // Нээсэн deal нь эрт байж болох тул 60 хоногоор өмнөөс уншина
   if(!HistorySelect(from - 60 * 86400, TimeCurrent() + 60)) return(out);
   int total = HistoryDealsTotal();
   int added = 0;
   for(int i = 0; i < total && added < 50; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      datetime closeAt = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      if(closeAt < from) continue;
      long type = HistoryDealGetInteger(t, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;  // мөнгө оруулах, шимтгэл зэрэг нь арилжаа биш
      long entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      long     posId = HistoryDealGetInteger(t, DEAL_POSITION_ID);
      double   closePrice = HistoryDealGetDouble(t, DEAL_PRICE);
      double   openPrice = closePrice;
      datetime openAt = closeAt;
      for(int j = i - 1; j >= 0; j--)                             // тухайн позицийн нээсэн deal
        {
         ulong o = HistoryDealGetTicket(j);
         if(o == 0) continue;
         if(HistoryDealGetInteger(o, DEAL_POSITION_ID) == posId && HistoryDealGetInteger(o, DEAL_ENTRY) == DEAL_ENTRY_IN)
           {
            openPrice = HistoryDealGetDouble(o, DEAL_PRICE);
            openAt = (datetime)HistoryDealGetInteger(o, DEAL_TIME);
            break;
           }
        }
      string sym = HistoryDealGetString(t, DEAL_SYMBOL);
      int    dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      if(dg <= 0) dg = 5;
      string side = (type == DEAL_TYPE_SELL) ? "BUY" : "SELL";    // BUY позицийг SELL deal хаадаг
      double profit = HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION);
      if(out != "") out += ",";
      out += "{\"ticket\":\"" + (string)t + "\",\"position\":\"" + (string)posId + "\",\"symbol\":\"" + JsonSafe(sym) + "\",\"side\":\"" + side +
             "\",\"lots\":" + Num(HistoryDealGetDouble(t, DEAL_VOLUME), 2) + ",\"openPrice\":" + Num(openPrice, dg) + ",\"closePrice\":" + Num(closePrice, dg) +
             ",\"openTime\":\"" + IsoUtc(openAt) + "\",\"closeTime\":\"" + IsoUtc(closeAt) + "\",\"profit\":" + Num(profit, 2) +
             ",\"magic\":\"" + (string)HistoryDealGetInteger(t, DEAL_MAGIC) + "\"}";
      added++;
     }
   return(out);
  }

// Сүүлийн 24 цагт хаагдсан, энэ роботын арилжаанууд (хамгийн сүүлийн 30)
string DealsJson()
  {
   string out = "";
   // Нээсэн deal нь 24 цагаас өмнө байж болох тул 7 хоногийг уншиж, зөвхөн 24 цагт хаагдсаныг илгээнэ
   datetime since = TimeCurrent() - 86400;
   if(!HistorySelect(TimeCurrent() - 7 * 86400, TimeCurrent() + 60)) return(out);
   int total = HistoryDealsTotal();
   int added = 0;
   for(int i = total - 1; i >= 0 && added < 30; i--)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if((datetime)HistoryDealGetInteger(t, DEAL_TIME) < since) break;
      if(HistoryDealGetInteger(t, DEAL_MAGIC) != MagicNumber) continue;
      if(HistoryDealGetString(t, DEAL_SYMBOL) != _Symbol) continue;
      long entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      long   posId = HistoryDealGetInteger(t, DEAL_POSITION_ID);
      double closePrice = HistoryDealGetDouble(t, DEAL_PRICE);
      double openPrice = closePrice;
      for(int j = 0; j < total; j++)                              // тухайн позицийн нээсэн deal-ийг олно
        {
         ulong o = HistoryDealGetTicket(j);
         if(o == 0) continue;
         if(HistoryDealGetInteger(o, DEAL_POSITION_ID) == posId && HistoryDealGetInteger(o, DEAL_ENTRY) == DEAL_ENTRY_IN)
           {
            openPrice = HistoryDealGetDouble(o, DEAL_PRICE);
            break;
           }
        }
      // BUY позицийг SELL deal хаадаг
      string side = (HistoryDealGetInteger(t, DEAL_TYPE) == DEAL_TYPE_SELL) ? "BUY" : "SELL";
      double profit = HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION);
      if(out != "") out += ",";
      out += "{\"ticket\":\"" + (string)t + "\",\"side\":\"" + side + "\",\"lots\":" + Num(HistoryDealGetDouble(t, DEAL_VOLUME), 2) +
             ",\"openPrice\":" + Num(openPrice, _Digits) + ",\"closePrice\":" + Num(closePrice, _Digits) + ",\"profit\":" + Num(profit, 2) +
             ",\"closeTime\":\"" + IsoUtc((datetime)HistoryDealGetInteger(t, DEAL_TIME)) + "\",\"position\":\"" + (string)posId + "\"}";
      added++;
     }
   return(out);
  }

//+------------------------------------------------------------------+
//| Day trader (DAY): вэб 15 минутын хаагдсан лаа бүр дээр           |
//| liquidity sweep → MSS → FVG руу буцах → хариу үйлдэл хэв маягийг |
//| хайж, олон аргын дүгнэлт ижил чиглэлд байвал дохио илгээнэ.      |
//| Робот зөвхөн захиалгыг тавина: stop нь вэбээс ирсэн $ зай,       |
//| target = stop × RR. Нэг удаад нэг арилжаа, 24 цагаас хэтрэхгүй.  |
//| Судалгаа: scripts/smc-research.ts                                 |
//+------------------------------------------------------------------+

void DayTimeExit()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsMine(t)) continue;
      if(TimeCurrent() - (datetime)PositionGetInteger(POSITION_TIME) >= 86400) trade.PositionClose(t);
     }
  }

void DayStep()
  {
   DayTimeExit();
   if(gState != "RUNNING" || gFinished != "") return;
   if(gDLast < 0) gDLast = GlobalVariableCheck("xau_day_last") ? (long)GlobalVariableGet("xau_day_last") : 0;
   if(WeekendQuiet()) { gSignal = "NONE"; gReason = L("Амралтын өдөр, зах хаалттай", "Weekend, market closed"); return; }
   if(gDId <= 0 || gDDir == 0)
     {
      gSignal = "NONE"; gBlock = ""; gBlockDetail = "";
      gReason = L("Setup хүлээж байна: sweep → MSS → FVG → хариу үйлдэл, дүгнэлттэй таарах", "Waiting for a setup: sweep → shift → FVG → reaction, in line with the reading");
      return;
     }
   gSignal = (gDDir > 0) ? "BUY" : "SELL";
   gReason = L("Setup: ", "Setup: ") + gSignal + ", stop $" + Num(gDRisk, 2) + ", RR " + Num(gDRR, 1);
   if(gDId == gDLast) return;                                    // энэ дохиогоор аль хэдийн орсон
   if(gDAge > 480) return;                                       // 8 минутаас хуучин дохио: үнэ хөдөлчихсөн
   if(TimeLocal() - gLastSyncOk > 30) return;
   if(CountPositions() + CountOrders() > 0) return;              // нэг удаад нэг арилжаа
   if(RealBlocked() || !TradingAllowed()) return;
   if(SpreadPoints() > MaxSpreadPoints) return;
   if(!GateCheck(0)) return;                                     // цаг, мэдээ, хэлбэлзэл, spread, өдрийн хязгаар
   double slD = gDRisk, tpD = gDRisk * gDRR, lots = 0.0;
   if(slD <= StopsMin()) return;
   if(!SizeTrade(slD, tpD, lots, false)) return;                 // stop-ийг хөдөлгөхгүй: энэ нь setup-ийн өөрийнх нь түвшин
   if(!FitsDayBudget(lots, slD)) return;
   if(SendMarket(gDDir, lots, slD, tpD, "xau-bot:" + Num(slD, 2)))
     {
      gDLast = gDId;
      GlobalVariableSet("xau_day_last", (double)gDId);
      Print("XauBot: day trader ", gSignal, L(" орлоо, лот ", " entered, lots "), Num(lots, 2), ", stop ", Num(slD, 2), ", target ", Num(tpD, 2));
     }
   else
      Print(L("XauBot: захиалга амжилтгүй — ", "XauBot: order failed — "), trade.ResultRetcodeDescription());
  }

//+------------------------------------------------------------------+
//| Дүгнэлт (READING): вэбийн олон аргын дүгнэлтийг шууд дагана.      |
//| Шинэ M15 лаа бүрд: орох чиглэлийг gCMin (эсвэл 9) арга дэмжиж,    |
//| эсрэг талаасаа олон бол орно. Stop = H1 ATR × 1.5, target = × 2.  |
//| Нэг удаад нэг арилжаа; stop эсвэл target-аараа хаагдана.          |
//| 3 жилийн 15 минутын лаан дээрх судалгаа: scripts/consensus-research.ts |
//+------------------------------------------------------------------+
datetime gReadLastBar = 0;
void ReadingStep()
  {
   if(gState != "RUNNING" || gFinished != "") return;
   if(WeekendQuiet()) { gSignal = "NONE"; gReason = L("Амралтын өдөр, зах хаалттай", "Weekend, market closed"); return; }
   datetime bar = iTime(_Symbol, PERIOD_M15, 0);
   if(bar == gReadLastBar) return;                               // шинэ M15 лаа нээгдэхэд л шийднэ
   if(TimeLocal() - gLastSyncOk > 30) { gReason = L("Вэбтэй холбоо тасарсан: дүгнэлт хуучирсан", "No link to the web: the reading is stale"); return; }
   gReadLastBar = bar;
   int need = (gCMin > 0) ? gCMin : 9;
   int dir = (gCBuy >= need && gCBuy > gCSell) ? 1 : ((gCSell >= need && gCSell > gCBuy) ? -1 : 0);
   gSignal = (dir > 0) ? "BUY" : ((dir < 0) ? "SELL" : "NONE");
   gReason = L("Дүгнэлт: өсөх ", "Reading: up ") + (string)gCBuy + L(", унах ", ", down ") + (string)gCSell + " / " + (string)gCTotal + L(" · шаардлага ", " · needs ") + (string)need;
   if(CountPositions() + CountOrders() > 0) return;              // нэг удаад нэг арилжаа
   if(dir == 0) { gBlock = ""; gBlockDetail = ""; return; }
   if(RealBlocked() || !TradingAllowed()) return;
   if(SpreadPoints() > MaxSpreadPoints) return;
   if(!GateCheck(0)) return;                                     // цаг, мэдээ, хэлбэлзэл, spread, өдрийн хязгаар
   if(gSiteAtr <= 0) { GateBlock("SITE_STOP", ""); return; }
   double slD = gSiteStopMult * gSiteAtr, tpD = slD * gSiteRR, lots = 0.0;
   if(!SizeTrade(slD, tpD, lots, false)) return;                 // stop-ийг ойртуулахгүй: судалсан дүрмийг өөрчилнө
   if(!FitsDayBudget(lots, slD)) return;
   if(SendMarket(dir, lots, slD, tpD, "xau-bot:" + Num(slD, 2)))
      Print("XauBot: ", gSignal, L(" дүгнэлтээр орлоо, лот ", " entered on the reading, lots "), Num(lots, 2), ", stop ", Num(slD, 2), ", target ", Num(tpD, 2));
   else
      Print(L("XauBot: захиалга амжилтгүй — ", "XauBot: order failed — "), trade.ResultRetcodeDescription());
  }

//+------------------------------------------------------------------+
//| Вэбтэй холбогдох: төлөвөө илгээж, тушаал авна                    |
//+------------------------------------------------------------------+
void Sync()
  {
   if(gTester) return;                                           // tester дотор вэб рүү хандахгүй
   if(StringLen(BotToken) == 0)
     {
      gLinkStatus = L("BotToken оруулаагүй", "BotToken not entered");
      return;
     }
   string json = "{\"account\":{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"mode\":\"" + AccountModeStr() +
                 "\",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                 ",\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",\"server\":\"" + JsonSafe(AccountInfoString(ACCOUNT_SERVER)) + "\"},\"symbol\":\"" + _Symbol + "\",\"bid\":" +
                 Num(SymbolInfoDouble(_Symbol, SYMBOL_BID), _Digits) + ",\"ask\":" + Num(SymbolInfoDouble(_Symbol, SYMBOL_ASK), _Digits) +
                 ",\"signal\":\"" + gSignal + "\",\"reason\":\"" + JsonText(gReason, 280) + "\",\"runPnl\":" + Num(gState == "RUNNING" ? RunPnl() : 0.0, 2) +
                 ",\"positions\":[" + PositionsJson() + "],\"deals\":[" + DealsJson() + "],\"finished\":\"" + gFinished + "\",\"plannedSeconds\":" + (string)gPlannedSeconds + ",\"elapsedSeconds\":" + (string)ElapsedSeconds() + ",\"version\":" + (string)ROBOT_VERSION +
                 ",\"gateOn\":" + (gGateOn ? "true" : "false") + ",\"block\":\"" + gBlock + "\",\"blockDetail\":\"" + JsonText(gBlockDetail, 100) + "\",\"tradesToday\":" + (string)gTradesToday +
                 ",\"dayPnl\":" + Num(gDayPnl, 2) + ",\"dailyLossHit\":" + (gDailyLossHit ? "true" : "false");
   string journal = JournalJson();
   if(journal != "") json += ",\"journal\":[" + journal + "]";
   json += "}";

   uchar data[];
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len <= 1) return;
   ArrayResize(data, len - 1);                                    // төгсгөлийн 0-ийг хасна
   uchar result[];
   string resHeaders;
   string headers = "Content-Type: application/json\r\nX-Bot-Token: " + BotToken + "\r\n";

   ResetLastError();
   int code = WebRequest("POST", ServerUrl, headers, 5000, data, result, resHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      gLinkStatus = (err == 4014) ? L("URL зөвшөөрөгдөөгүй: Tools > Options > Expert Advisors > Allow WebRequest", "URL not allowed: Tools > Options > Expert Advisors > Allow WebRequest") : L("холболтын алдаа ", "connection error ") + (string)err;
      return;
     }
   if(code == 401) { gLinkStatus = L("токен буруу", "wrong token"); return; }
   if(code == 400) { gLinkStatus = L("вэб роботын мэдээг хүлээж авсангүй (400) — шинэ XauBot.ex5 татна уу", "the web rejected the robot's report (400) — download the new XauBot.ex5"); return; }
   if(code != 200) { gLinkStatus = L("серверийн хариу ", "server replied ") + (string)code; return; }

   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   gLastSyncOk = TimeLocal();
   gLinkStatus = L("холбогдсон", "connected");

   string state = JStr(body, "state");
   string runId = JStr(body, "runId");
   gCloseAll   = JBool(body, "closeAll");
   gLots       = MathMax(0.0, JNum(body, "lots"));
   gMaxPos     = (int)MathMax(1.0, JNum(body, "maxPositions"));
   gSlAtr      = JNum(body, "slAtr");
   gTpAtr      = JNum(body, "tpAtr");
   gTarget     = JNum(body, "profitTarget");
   gMaxLoss    = JNum(body, "maxLoss");
   if(JRaw(body, "gateOn") != "")                               // орох шүүлтүүрийн тохиргоо (вэб v2.80+)
     {
      gGateOn        = JBool(body, "gateOn");
      gGTrend        = JBool(body, "gTrend");
      gGStart        = (int)MathMax(0.0, MathMin(23.0, JNum(body, "gSessionStart")));
      gGEnd          = (int)MathMax(0.0, MathMin(23.0, JNum(body, "gSessionEnd")));
      gGAtrMin       = MathMax(0.0, JNum(body, "gAtrMin"));
      gGAtrMax       = MathMax(0.0, JNum(body, "gAtrMax"));
      gGSpreadPct    = MathMax(0.0, JNum(body, "gSpreadPct"));
      gGRsiMax       = MathMax(0.0, MathMin(100.0, JNum(body, "gRsiMax")));
      gGExtAtr       = MathMax(0.0, JNum(body, "gExtAtr"));
      gGMaxTrades    = (int)MathMax(0.0, JNum(body, "gMaxTrades"));
      gGDailyLossPct = MathMax(0.0, JNum(body, "gDailyLossPct"));
      gBlackouts     = JStr(body, "blackouts");
      gCMin          = (int)MathMax(0.0, JNum(body, "cMin"));
      gCBuy          = (int)MathMax(0.0, JNum(body, "cBuy"));
      gCSell         = (int)MathMax(0.0, JNum(body, "cSell"));
      gCTotal        = (int)MathMax(0.0, JNum(body, "cTotal"));
      gProtect       = JBool(body, "protect");
      gRiskMode      = (int)MathMax(0.0, MathMin(2.0, JNum(body, "rMode")));
      gRiskVal       = MathMax(0.0, JNum(body, "rVal"));
      gStopMode      = (int)MathMax(0.0, MathMin(1.0, JNum(body, "sMode")));
      gSiteAtr       = MathMax(0.0, JNum(body, "sAtr"));
      gSiteStopMult  = MathMax(0.2, MathMin(10.0, JNum(body, "sStop") > 0 ? JNum(body, "sStop") : 1.5));
      gSiteRR        = MathMax(0.2, MathMin(10.0, JNum(body, "sRR") > 0 ? JNum(body, "sRR") : 2.0));
      gStatsAt       = 0;
     }
   if(Language == LANG_WEB)
     {
      string lang = JStr(body, "lang");                        // вэбийн Тохиргоо дахь хэл
      if(lang == "en" || lang == "mn") gLang = lang;
     }
   string mode = JStr(body, "mode");
   string newMode = (mode == "BASKET") ? "BASKET" : ((mode == "ASIAN") ? "ASIAN" : ((mode == "READING") ? "READING" : ((mode == "DAY") ? "DAY" : "SCALPER")));
   gDId   = (long)JNum(body, "dId");
   gDDir  = (int)JNum(body, "dDir");
   gDRisk = MathMax(0.0, JNum(body, "dRisk"));
   gDRR   = (JNum(body, "dRR") > 0) ? JNum(body, "dRR") : 2.0;
   gDAge  = (JRaw(body, "dAge") != "") ? (int)JNum(body, "dAge") : 99999;
   gDExit = (JRaw(body, "dExit") != "") ? (long)JNum(body, "dExit") : 0;
   gHasOrders = (JRaw(body, "orders") != "");                    // вэб v3.70+: сешн бүрийн захиалга, SL/TP үнээр
   gOrders    = JStr(body, "orders");
   if(JRaw(body, "oMaxAge") != "") gOMaxAge = (int)MathMax(60.0, JNum(body, "oMaxAge"));
   if(JRaw(body, "oSlipR") != "")  gOSlipR  = MathMax(0.0, JNum(body, "oSlipR"));
   if(JRaw(body, "jFrom") != "")   gJFrom   = (long)JNum(body, "jFrom");   // вэб v3.90+: журналын заагч
   if(newMode != gMode) { gRuleLastBar = 0; gReadLastBar = 0; }
   gMode       = newMode;

   if(state == "RUNNING" && runId != "" && runId != gActiveRunId)   // шинэ ажиллагаа эхэллээ
     {
      BeginRun(runId);
      Print("XauBot: Start (", gMode, L(") — лот ", ") — lots "), Num(gLots, 2), L(", арилжаа ", ", trades "), (string)gMaxPos);
     }
   if(state != "RUNNING" && gState == "RUNNING")
      Print("XauBot: Stop");
   gState = (state == "RUNNING") ? "RUNNING" : "STOPPED";
   gRunId = runId;

   if(gState != "RUNNING")
     {
      gFinished = "";
      if(gCloseAll) CloseAllMine();
     }
  }

void ShowStatus()
  {
   string s = "XauBot · " + AccountModeStr() + L(" данс · вэб: ", " account · web: ") + LinkText() + "\n";
   s += L("Төлөв: ", "State: ") + (gState == "RUNNING" ? (gFinished == "" ? L("АЖИЛЛАЖ БАЙНА", "RUNNING") : L("дуусгаж байна (", "finishing (") + gFinished + ")") : L("зогссон", "stopped")) + "\n";
   s += L("Хэрэгсэл: ", "Tool: ") + (gMode == "BASKET" ? L("Багц", "Basket") : (gMode == "ASIAN" ? L("Азийн breakout", "Asian breakout") : (gMode == "READING" ? L("Дүгнэлт", "Reading") : (gMode == "DAY" ? "Day trader" : "Scalper")))) + "\n";
   s += L("Дохио: ", "Signal: ") + gSignal + " — " + gReason + "\n";
   s += GateLine() + "\n";
   if(gGateOn) s += L("Өнөөдөр: ", "Today: ") + (string)gTradesToday + (gGMaxTrades > 0 ? " / " + (string)gGMaxTrades : "") + L(" оролт · ", " entries · ") + Num(gDayPnl, 2) + (gDailyLossHit ? L(" · АЛДАГДЛЫН ХЯЗГААР", " · LOSS STOP") : "") + "\n";
   s += L("Нээлттэй: ", "Open: ") + (string)CountPositions() + " / " + (string)gMaxPos + L(" · лот ", " · lots ") + Num(gLots, 2);
   if(gState == "RUNNING") s += L(" · энэ удаа: ", " · this run: ") + Num(RunPnl(), 2);
   if(gState == "RUNNING" && gMode == "BASKET" && gFirstEntry > 0) s += L("\nБагц (", "\nBasket (") + gRunSide + "): +" + Num(gTarget, 2) + L(" хүрвэл эсвэл -", " or -") + Num(gMaxLoss, 2) + L(" хүрвэл бүгдийг хаана", " closes everything");
   if(gState == "RUNNING" && gMode == "SCALPER" && gFirstEntry > 0) s += L("\nХугацаа: ", "\nTime: ") + (string)ElapsedSeconds() + " / " + (string)gPlannedSeconds + L(" сек (", " s (") + gRunSide + ")";
   if(gState == "RUNNING" && gMode != "ASIAN" && gMode != "READING" && gMode != "DAY" && gFirstEntry <= 0) s += L("\nЭхний дохиог хүлээж байна", "\nWaiting for the first signal");
   if(RealBlocked()) s += L("\nЖИНХЭНЭ ДАНС: AllowRealAccount унтраалттай тул арилжаа хийхгүй", "\nREAL ACCOUNT: AllowRealAccount is off, so no trades are placed");
   Comment(s);
  }
//+------------------------------------------------------------------+

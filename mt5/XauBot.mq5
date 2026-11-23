//+------------------------------------------------------------------+
//| XauBot.mq5 — XAU Analytics-ийн вэб самбараас удирддаг робот      |
//| Арилжааг энэ робот брокерын бодит цагийн үнээр өөрөө хийнэ.      |
//| Вэб самбар: тохиргоо, Start/Stop, хяналт.                        |
//| АНХААР: Scalper арга шалгагдаагүй. Ашиг баталгаагүй.             |
//+------------------------------------------------------------------+
#property copyright "XAU Analytics"
#property version   "2.60"
#property description "Web-controlled robot with two tools, scalper and basket. Demo by default; real accounts need AllowRealAccount AND the switch on the web."

#include <Trade\Trade.mqh>

input string ServerUrl            = "https://xau-analytics-production.up.railway.app/api/bot/sync"; // Вэб самбар дээрх хаяг · Web address
input string BotToken             = "";       // Вэб дээр үүсгэсэн токен · Token from the web
input bool   AllowRealAccount     = false;    // Жинхэнэ данс зөвшөөрөх · Allow a real account
input long   MagicNumber          = 20261121; // Роботын арилжааг ялгах дугаар · Magic number
input int    SyncSeconds          = 1;        // Вэбтэй холбогдох давтамж (сек) · Sync every (s)
input int    EntryCooldownSeconds = 5;        // Хоёр арилжааны хоорондох зай (сек) · Gap between entries (s)
input int    MaxSpreadPoints      = 600;      // Spread үүнээс их бол орохгүй (point) · No entry above this spread
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
   TOOL_ASIAN    = 2, // Дүрэм 1 · Rule 1: Asian range breakout + daily trend
   TOOL_LONDON   = 3, // Дүрэм 2 · Rule 2: London open first-hour breakout
   TOOL_PULLBACK = 4, // Дүрэм 3 · Rule 3: 1-hour pullback with the daily trend
   TOOL_FADE     = 5, // Дүрэм 4 · Rule 4: fading an overstretched price (1h)
   TOOL_ICT      = 6, // ICT/SMC: sweep, MSS, FVG, OTE
   TOOL_SMCX     = 7  // SMC Active: breakout, QM, nearest liquidity
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
input int    TesterRestartSeconds = 60;       // Дахин эхлэх хүртэлх зай (сек) · Restart after (s)
input int    ServerUtcOffsetWinter = 2;       // Серверийн цаг UTC-ээс түрүүлэх цаг (өвөл) · Server hours ahead of UTC (winter)
input bool   ServerDstEurope      = true;     // Сервер Европын зуны цаг мөрддөг · Server follows EU summer time

CTrade trade;
int    hEmaFast = INVALID_HANDLE, hEmaSlow = INVALID_HANDLE, hEmaTrend = INVALID_HANDLE, hRsi = INVALID_HANDLE, hAtr = INVALID_HANDLE;

// серверээс ирсэн тушаал
string gState = "STOPPED";
string gRunId = "";
double gLots = 0.01, gSlAtr = 1.5, gTpAtr = 2.0, gTarget = 0.0, gMaxLoss = 0.0;
int    gMaxPos = 1;
bool   gCloseAll = false;
string gMode = "SCALPER";          // SCALPER: нэг нэгээр орно · BASKET: бүгдийг зэрэг нээж, нийт дүнгээр зэрэг хаана

#define ROBOT_VERSION 5             // вэб энэ дугаараар роботын файл шинэ эсэхийг мэднэ

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
   hD1Fast   = iMA(_Symbol, PERIOD_D1, 20, 0, MODE_EMA, PRICE_CLOSE);   // Азийн breakout-ын өдрийн тренд
   hD1Slow   = iMA(_Symbol, PERIOD_D1, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hEmaTrend == INVALID_HANDLE || hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hD1Fast == INVALID_HANDLE || hD1Slow == INVALID_HANDLE)
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
   Comment("");
  }

// Нэг удаагийн хаалт амжилтгүй болж арилжаа үлдвэл дуустал нь дахин хаана.
void RetryClose()
  {
   if(!gClosing) return;
   if(CountPositions() == 0) { gClosing = false; return; }
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
   if(gMode == "ASIAN")
     {
      RetryClose();
      LiveAsianStep();
      Sync();
      ShowStatus();
      return;
     }
   RetryClose();
   EvaluateSignal();
   ManageRun();
   Sync();
   ShowStatus();
  }

void OnTick()
  {
   if(IsRuleTool()) { RuleStep(); return; }
   if(gMode == "ASIAN") { RetryClose(); LiveAsianStep(); return; }
   TesterStep();
   RetryClose();
   EvaluateSignal();
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

void CloseAllMine()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(IsMine(t))
         if(!trade.PositionClose(t))
            Print(L("XauBot: арилжаа хааж чадсангүй #", "XauBot: could not close trade #"), (string)t, " — ", trade.ResultRetcodeDescription());
     }
  }

bool RealBlocked()
  {
   return(AccountModeStr() == "REAL" && !AllowRealAccount);
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
   if(gSignal != "NONE" && gSignal != gRunSide) { Finish("REVERSAL"); return; }   // чиглэл эргэлээ
   if(ElapsedSeconds() >= gPlannedSeconds)      { Finish("TIME");     return; }   // тооцсон хугацаа дууслаа
  }

//+------------------------------------------------------------------+
//| Арилжаа нээх                                                     |
//+------------------------------------------------------------------+
// Багц: дохио гармагц тохируулсан тооны арилжааг нэг дор нээнэ. Нэг ажиллагаанд нэг л багц.
void TryBasket()
  {
   if(gFirstEntry > 0) return;                                   // багц аль хэдийн нээгдсэн
   if(gTarget <= 0 || gMaxLoss <= 0) { gReason = L("Багцын ашиг, алдагдлын дүн тохируулаагүй", "The basket profit and loss amounts are not set"); return; }
   if(RealBlocked()) return;
   if(!gTester && TimeLocal() - gLastSyncOk > 30) return;
   if(TimeCurrent() - gLastEntry < EntryCooldownSeconds) return;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > MaxSpreadPoints) return;

   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   double lots = MathFloor(gLots / step + 1e-9) * step;
   if(lots < vmin) { gReason = L("Лот брокерын доод хэмжээнээс бага байна", "Lots are below the broker's minimum"); return; }
   if(lots > vmax) lots = vmax;
   lots = NormalizeDouble(lots, 2);

   // Аваарын stop: робот, компьютер унтарсан үед л ажиллах ёстой тул нийт алдагдлын хязгаараас 2 дахин хол тавина.
   double contract = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   if(contract <= 0) contract = 100.0;
   double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double slDist = MathMax(2.0 * gMaxLoss / (lots * gMaxPos * contract) + spread, minDist + spread);

   string side = gSignal;
   int opened = 0;
   for(int i = 0; i < gMaxPos; i++)
     {
      bool ok = false;
      if(side == "BUY")
         ok = trade.Buy(lots, _Symbol, 0.0, NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_ASK) - slDist, _Digits), 0.0, "xau-basket");
      else
         ok = trade.Sell(lots, _Symbol, 0.0, NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_BID) + slDist, _Digits), 0.0, "xau-basket");
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
   if(TotalVolume() + gLots > gLots * gMaxPos + 1e-8) return;     // netting дансанд ч нийт лот хэтрэхгүй
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > MaxSpreadPoints) return;

   double atr = Buf(hAtr, 0);
   if(atr == EMPTY_VALUE || atr <= 0) return;

   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   double lots = MathFloor(gLots / step + 1e-9) * step;
   if(lots < vmin) { gReason = L("Лот брокерын доод хэмжээнээс бага байна", "Lots are below the broker's minimum"); return; }
   if(lots > vmax) lots = vmax;                                  // брокерын нэг захиалгын дээд хэмжээ
   lots = NormalizeDouble(lots, 2);

   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double slDist = MathMax(gSlAtr * atr, minDist);
   double tpDist = MathMax(gTpAtr * atr, minDist);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   bool ok = false;
   if(gSignal == "BUY")
      ok = trade.Buy(lots, _Symbol, 0.0, NormalizeDouble(ask - slDist, _Digits), NormalizeDouble(ask + tpDist, _Digits), "xau-bot");
   else
      ok = trade.Sell(lots, _Symbol, 0.0, NormalizeDouble(bid + slDist, _Digits), NormalizeDouble(bid - tpDist, _Digits), "xau-bot");

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
      gPlannedSeconds = PlanSeconds();
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

double RuleLots()
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   double lots = MathFloor((gTester ? TesterLots : gLots) / step + 1e-9) * step;
   if(lots < vmin) return(0.0);
   if(lots > vmax) lots = vmax;
   return(NormalizeDouble(lots, 2));
  }

// dir: +1 BUY, -1 SELL. slDist, tpDist нь орох үнээс тооцсон зай.
bool RuleOpen(const int dir, const double slDist, const double tpDist, const datetime exitAt)
  {
   double lots = RuleLots();
   if(lots <= 0) return(false);
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > MaxSpreadPoints) return(false);
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(slDist <= minDist || tpDist <= minDist) return(false);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   bool ok = false;
   if(dir > 0)
      ok = trade.Buy(lots, _Symbol, 0.0, NormalizeDouble(ask - slDist, _Digits), NormalizeDouble(ask + tpDist, _Digits), "xau-rule");
   else
      ok = trade.Sell(lots, _Symbol, 0.0, NormalizeDouble(bid + slDist, _Digits), NormalizeDouble(bid - tpDist, _Digits), "xau-rule");
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
   if(CountPositions() > 0 && gRuleExitAt > 0 && TimeCurrent() >= gRuleExitAt)
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
      // Хүрээ: 00:00-07:00 UTC. 07:00-16:00 UTC-д өдрийн трендийн чиглэлд хүрээнээс гарч хаагдсан эхний лаа.
      // Stop: хүрээний дунд. Target: stop-оос 2 дахин хол. 20:00 UTC-д хаана.
      if(u.hour < 7) { RangeAdd(h, l); return; }
      if(gRuleTraded || gRangeBars < 20 || u.hour >= 16 || CountPositions() > 0) return;
      int trend = DailyTrend();
      int dir = (trend > 0 && c > gRangeHigh) ? 1 : ((trend < 0 && c < gRangeLow) ? -1 : 0);
      if(dir == 0) return;
      double dist = MathAbs(price - (gRangeHigh + gRangeLow) / 2.0);
      RuleOpen(dir, dist, dist * 2.0, dayStartServer + 20 * 3600);
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
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > MaxSpreadPoints) return;
   entry = NormalizeDouble(entry, _Digits); stop = NormalizeDouble(stop, _Digits); tp = NormalizeDouble(tp, _Digits);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   bool ok = false;
   if(dir > 0)
     {
      if(entry >= ask - minDist) return;                         // үнэ аль хэдийн орох түвшинд/доор: алгасна
      ok = trade.BuyLimit(lots, entry, _Symbol, stop, tp, ORDER_TIME_GTC, 0, "xau-ict");
     }
   else
     {
      if(entry <= bid + minDist) return;
      ok = trade.SellLimit(lots, entry, _Symbol, stop, tp, ORDER_TIME_GTC, 0, "xau-ict");
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
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > MaxSpreadPoints) return;
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = NormalizeDouble(stop, _Digits), t = NormalizeDouble(tp, _Digits), e = NormalizeDouble(entry, _Digits);
   if(!limit)
     {
      if(dir > 0) { if(ask - sl <= minDist || t - ask <= minDist) return; trade.Buy(lots, _Symbol, 0.0, sl, t, tag); }
      else        { if(sl - bid <= minDist || bid - t <= minDist) return; trade.Sell(lots, _Symbol, 0.0, sl, t, tag); }
      return;
     }
   if(dir > 0) { if(e >= ask - minDist) return; trade.BuyLimit(lots, e, _Symbol, sl, t, ORDER_TIME_GTC, 0, tag); }
   else        { if(e <= bid + minDist) return; trade.SellLimit(lots, e, _Symbol, sl, t, ORDER_TIME_GTC, 0, tag); }
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
      if(HistoryDealGetString(t, DEAL_COMMENT) == "xau-rule") return(true);
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
      if(PositionGetString(POSITION_COMMENT) != "xau-rule") continue;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      datetime utc = opened - ServerUtcOffset(opened) * 3600;
      MqlDateTime u;
      TimeToStruct(utc, u);
      datetime exitAt = opened - (u.hour * 3600 + u.min * 60 + u.sec) + 20 * 3600;
      if(TimeCurrent() >= exitAt) trade.PositionClose(ticket);
     }
  }

void LiveAsianStep()
  {
   AsianTimeExit();
   if(WeekendQuiet()) { gSignal = "NONE"; gReason = L("Амралтын өдөр, зах хаалттай", "Weekend, market closed"); return; }   // зөвхөн бичвэр; үнэ ирэхгүй үед арилжаа ч байхгүй
   datetime bar = iTime(_Symbol, PERIOD_M15, 0);
   if(bar == gRuleLastBar) return;                               // шинэ M15 лаа нээгдэхэд л шийднэ
   gRuleLastBar = bar;
   gSignal = "NONE";
   datetime closed = iTime(_Symbol, PERIOD_M15, 1);
   if(closed <= 0) { gReason = L("Лааны дата ачаалж байна", "Loading candle data"); return; }
   datetime utc = closed - ServerUtcOffset(closed) * 3600;
   MqlDateTime u;
   TimeToStruct(utc, u);
   if(u.day_of_week == 0 || u.day_of_week == 6) { gReason = L("Амралтын өдөр, зах хаалттай", "Weekend, market closed"); return; }
   datetime dayStart = closed - (u.hour * 3600 + u.min * 60 + u.sec);   // UTC 00:00, серверийн цагаар
   int trend = DailyTrend();
   string trendText = (trend > 0) ? L("өдрийн тренд дээш", "daily trend up") : ((trend < 0) ? L("өдрийн тренд доош", "daily trend down") : L("өдрийн тренд тодорхойгүй", "daily trend unclear"));
   if(u.hour < 7) { gReason = L("Азийн хүрээ бүрдэж байна · ", "Asian range forming · ") + trendText; return; }

   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_M15, dayStart, closed, r);
   if(n <= 0) { gReason = L("Лааны дата ачаалж байна", "Loading candle data"); return; }
   double hi = 0.0, lo = 0.0;
   int rangeBars = 0;
   bool earlier = false, fresh = false;
   for(int i = 0; i < n; i++)
     {
      if(r[i].time < dayStart) continue;
      if(r[i].time < dayStart + 7 * 3600)
        {
         if(rangeBars == 0) { hi = r[i].high; lo = r[i].low; }
         else { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
         rangeBars++;
         continue;
        }
      if(r[i].time >= dayStart + 16 * 3600) break;
      bool outside = (trend > 0 && r[i].close > hi) || (trend < 0 && r[i].close < lo);
      if(!outside) continue;
      if(r[i].time == closed) fresh = true; else earlier = true;
     }
   if(rangeBars < 20) { gReason = L("Азийн хүрээний дата дутуу", "Asian range data incomplete"); return; }
   string rangeText = L("Хүрээ ", "Range ") + Num(lo, 2) + "-" + Num(hi, 2) + " · " + trendText;
   if(trend == 0) { gReason = rangeText; return; }
   if(RuleTradedSince(dayStart)) { gReason = rangeText + L(" · өнөөдрийн арилжаа хийгдсэн", " · today's trade is done"); return; }
   if(u.hour >= 16) { gReason = rangeText + L(" · орох цонх хаагдсан", " · entry window closed"); return; }
   if(earlier) { gReason = rangeText + L(" · breakout өмнө нь гарсан, өнөөдөр орохгүй", " · the breakout came earlier, no entry today"); return; }
   if(!fresh) { gReason = rangeText + L(" · breakout хүлээж байна", " · waiting for a breakout"); return; }

   // Саяхан хаагдсан лаа хүрээнээс трендийн чиглэлд гарлаа
   if(gState != "RUNNING") { gReason = rangeText + L(" · breakout гарсан, бот зогссон байсан", " · the breakout came while the bot was stopped"); return; }
   if(CountPositions() > 0) return;
   if(RealBlocked()) { gReason = L("Жинхэнэ данс зөвшөөрөгдөөгүй", "Real account not allowed"); return; }
   if(TimeLocal() - gLastSyncOk > 30) { gReason = L("Вэбтэй холбоо тасарсан тул орсонгүй", "No entry: the web connection was lost"); return; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { gReason = L("Algo Trading унтраалттай тул орсонгүй", "No entry: Algo Trading is off"); return; }
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double dist = MathAbs(price - (hi + lo) / 2.0);
   if(RuleOpen(trend, dist, dist * 2.0, dayStart + 20 * 3600))
     {
      gSignal = (trend > 0) ? "BUY" : "SELL";
      gReason = rangeText + L(" · хүрээнээс гарлаа, орлоо", " · broke out of the range, entered");
      Print(L("XauBot: Азийн breakout — ", "XauBot: Asian breakout — "), gSignal, L(" лот ", " lots "), Num(RuleLots(), 2));
     }
   else
      gReason = rangeText + L(" · захиалга амжилтгүй: ", " · order failed: ") + trade.ResultRetcodeDescription();
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
   datetime gmt = serverTime - (TimeTradeServer() - TimeGMT());
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

// Сүүлийн 24 цагт хаагдсан, энэ роботын арилжаанууд (хамгийн сүүлийн 30)
string DealsJson()
  {
   string out = "";
   if(!HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 60)) return(out);
   int total = HistoryDealsTotal();
   int added = 0;
   for(int i = total - 1; i >= 0 && added < 30; i--)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
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
             ",\"closeTime\":\"" + IsoUtc((datetime)HistoryDealGetInteger(t, DEAL_TIME)) + "\"}";
      added++;
     }
   return(out);
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
                 ",\"signal\":\"" + gSignal + "\",\"reason\":\"" + gReason + "\",\"runPnl\":" + Num(gState == "RUNNING" ? RunPnl() : 0.0, 2) +
                 ",\"positions\":[" + PositionsJson() + "],\"deals\":[" + DealsJson() + "],\"finished\":\"" + gFinished + "\",\"plannedSeconds\":" + (string)gPlannedSeconds + ",\"elapsedSeconds\":" + (string)ElapsedSeconds() + ",\"version\":" + (string)ROBOT_VERSION + "}";

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
   if(code != 200) { gLinkStatus = L("серверийн хариу ", "server replied ") + (string)code; return; }

   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   gLastSyncOk = TimeLocal();
   gLinkStatus = L("холбогдсон", "connected");

   string state = JStr(body, "state");
   string runId = JStr(body, "runId");
   gCloseAll   = JBool(body, "closeAll");
   gLots       = JNum(body, "lots");
   gMaxPos     = (int)JNum(body, "maxPositions");
   gSlAtr      = JNum(body, "slAtr");
   gTpAtr      = JNum(body, "tpAtr");
   gTarget     = JNum(body, "profitTarget");
   gMaxLoss    = JNum(body, "maxLoss");
   if(Language == LANG_WEB)
     {
      string lang = JStr(body, "lang");                        // вэбийн Тохиргоо дахь хэл
      if(lang == "en" || lang == "mn") gLang = lang;
     }
   string mode = JStr(body, "mode");
   string newMode = (mode == "BASKET") ? "BASKET" : ((mode == "ASIAN") ? "ASIAN" : "SCALPER");
   if(newMode != gMode) gRuleLastBar = 0;
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
   s += L("Хэрэгсэл: ", "Tool: ") + (gMode == "BASKET" ? L("Багц", "Basket") : (gMode == "ASIAN" ? L("Азийн breakout", "Asian breakout") : "Scalper")) + "\n";
   s += L("Дохио: ", "Signal: ") + gSignal + " — " + gReason + "\n";
   s += L("Нээлттэй: ", "Open: ") + (string)CountPositions() + " / " + (string)gMaxPos + L(" · лот ", " · lots ") + Num(gLots, 2);
   if(gState == "RUNNING") s += L(" · энэ удаа: ", " · this run: ") + Num(RunPnl(), 2);
   if(gState == "RUNNING" && gMode == "BASKET" && gFirstEntry > 0) s += L("\nБагц (", "\nBasket (") + gRunSide + "): +" + Num(gTarget, 2) + L(" хүрвэл эсвэл -", " or -") + Num(gMaxLoss, 2) + L(" хүрвэл бүгдийг хаана", " closes everything");
   if(gState == "RUNNING" && gMode == "SCALPER" && gFirstEntry > 0) s += L("\nХугацаа: ", "\nTime: ") + (string)ElapsedSeconds() + " / " + (string)gPlannedSeconds + L(" сек (", " s (") + gRunSide + ")";
   if(gState == "RUNNING" && gMode != "ASIAN" && gFirstEntry <= 0) s += L("\nЭхний дохиог хүлээж байна", "\nWaiting for the first signal");
   if(RealBlocked()) s += L("\nЖИНХЭНЭ ДАНС: AllowRealAccount унтраалттай тул арилжаа хийхгүй", "\nREAL ACCOUNT: AllowRealAccount is off, so no trades are placed");
   Comment(s);
  }
//+------------------------------------------------------------------+

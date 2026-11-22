//+------------------------------------------------------------------+
//| XauBot.mq5 — XAU Analytics-ийн вэб самбараас удирддаг робот      |
//| Арилжааг энэ робот брокерын бодит цагийн үнээр өөрөө хийнэ.      |
//| Вэб самбар: тохиргоо, Start/Stop, хяналт.                        |
//| АНХААР: Scalper арга шалгагдаагүй. Ашиг баталгаагүй.             |
//+------------------------------------------------------------------+
#property copyright "XAU Analytics"
#property version   "2.30"
#property description "Web-controlled robot with two tools, scalper and basket. Demo by default; real accounts need AllowRealAccount AND the switch on the web."

#include <Trade\Trade.mqh>

input string ServerUrl            = "https://xau-analytics-production.up.railway.app/api/bot/sync"; // Вэб самбар дээрх хаяг
input string BotToken             = "";       // Вэб самбар дээр үүсгэсэн токен
input bool   AllowRealAccount     = false;    // Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх
input long   MagicNumber          = 20261121; // Энэ роботын арилжааг ялгах дугаар
input int    SyncSeconds          = 1;        // Вэбтэй холбогдох давтамж (секунд)
input int    EntryCooldownSeconds = 5;        // Хоёр арилжааны хоорондох хамгийн бага зай (секунд)
input int    MaxSpreadPoints      = 600;      // Spread үүнээс их бол орохгүй (point)

// Strategy Tester дотор вэбтэй холбогдох боломжгүй тул тохиргоог эндээс авна.
// Нэг ажиллагаа дуусмагц TesterRestartSeconds-ийн дараа дахин "Start" дарсантай адил шинээр эхэлнэ.
enum ENUM_XAU_TOOL
  {
   TOOL_SCALPER  = 0, // Scalper
   TOOL_BASKET   = 1, // Багц
   TOOL_ASIAN    = 2, // Дүрэм 1: Азийн хүрээний breakout + өдрийн тренд
   TOOL_LONDON   = 3, // Дүрэм 2: Лондон нээлтийн эхний цагийн breakout
   TOOL_PULLBACK = 4, // Дүрэм 3: Өдрийн тренд дагасан 1 цагийн буцалт
   TOOL_FADE     = 5  // Дүрэм 4: Хэт холдсон үнийн эсрэг (1 цаг)
  };
input group "Strategy Tester (зөвхөн backtest-д хэрэглэгдэнэ)"
input ENUM_XAU_TOOL TesterTool    = TOOL_SCALPER; // Хэрэгсэл
input double TesterLots           = 0.01;     // Лот (арилжаа бүрт)
input int    TesterCount          = 3;        // Зэрэг нээх арилжааны тоо
input double TesterSlAtr          = 1.5;      // Scalper: stop loss (ATR x)
input double TesterTpAtr          = 2.0;      // Scalper: take profit (ATR x)
input double TesterProfit         = 0.0;      // Нийт ашиг $ хүрвэл хаах (Багцад заавал)
input double TesterLoss           = 0.0;      // Нийт алдагдал $ хүрвэл хаах (Багцад заавал)
input int    TesterRestartSeconds = 60;       // Дахин эхлэх хүртэлх зай (секунд)
input int    ServerUtcOffsetWinter = 2;       // Дүрэм 1-4: серверийн цаг UTC-ээс хэдэн цагаар түрүүлдэг (өвөл)
input bool   ServerDstEurope      = true;     // Дүрэм 1-4: сервер Европын зуны цаг мөрддөг

CTrade trade;
int    hEmaFast = INVALID_HANDLE, hEmaSlow = INVALID_HANDLE, hEmaTrend = INVALID_HANDLE, hRsi = INVALID_HANDLE, hAtr = INVALID_HANDLE;

// серверээс ирсэн тушаал
string gState = "STOPPED";
string gRunId = "";
double gLots = 0.01, gSlAtr = 1.5, gTpAtr = 2.0, gTarget = 0.0, gMaxLoss = 0.0;
int    gMaxPos = 1;
bool   gCloseAll = false;
string gMode = "SCALPER";          // SCALPER: нэг нэгээр орно · BASKET: бүгдийг зэрэг нээж, нийт дүнгээр зэрэг хаана

#define ROBOT_VERSION 3             // вэб энэ дугаараар роботын файл шинэ эсэхийг мэднэ

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
string   gLinkStatus = "холбогдоогүй";
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

//+------------------------------------------------------------------+
int OnInit()
  {
   hEmaFast  = iMA(_Symbol, PERIOD_M1, 9, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow  = iMA(_Symbol, PERIOD_M1, 21, 0, MODE_EMA, PRICE_CLOSE);
   hEmaTrend = iMA(_Symbol, PERIOD_M5, 50, 0, MODE_EMA, PRICE_CLOSE);
   hRsi      = iRSI(_Symbol, PERIOD_M1, 7, PRICE_CLOSE);
   hAtr      = iATR(_Symbol, PERIOD_M1, 14);
   hD1Fast   = iMA(_Symbol, PERIOD_D1, 20, 0, MODE_EMA, PRICE_CLOSE);   // Азийн breakout-ын өдрийн тренд
   hD1Slow   = iMA(_Symbol, PERIOD_D1, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hEmaTrend == INVALID_HANDLE || hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hD1Fast == INVALID_HANDLE || hD1Slow == INVALID_HANDLE)
     {
      Print("XauBot: индикатор үүсгэж чадсангүй");
      return(INIT_FAILED);
     }
   if(StringLen(BotToken) == 0 && !MQLInfoInteger(MQL_TESTER))
      Print("XauBot: BotToken хоосон байна — вэб самбар дээр токен үүсгээд энд оруулна уу");
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
         if(hD1Fast == INVALID_HANDLE || hD1Slow == INVALID_HANDLE || hH1Ema20 == INVALID_HANDLE || hH1Ema50 == INVALID_HANDLE || hH1Rsi == INVALID_HANDLE || hH1Atr == INVALID_HANDLE)
            return(INIT_FAILED);
         gMode = "RULE";
         EventSetTimer(MathMax(1, SyncSeconds));
         return(INIT_SUCCEEDED);
        }
      if(gMode == "BASKET" && (gTarget <= 0 || gMaxLoss <= 0))
        {
         Print("XauBot: Багцыг турших бол TesterProfit, TesterLoss хоёуланг 0-ээс их тавина");
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
            Print("XauBot: арилжаа хааж чадсангүй #", (string)t, " — ", trade.ResultRetcodeDescription());
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
      gReason = "Индикаторын дата ачаалж байна";
      return;
     }
   string rsi = DoubleToString(rs, 0);
   if(ef > es && bid > et && rs > 50 && rs < 75)
     {
      gSignal = "BUY";
      gReason = "M1 EMA9 > EMA21 · M5 тренд дээш · RSI " + rsi;
     }
   else if(ef < es && bid < et && rs < 50 && rs > 25)
     {
      gSignal = "SELL";
      gReason = "M1 EMA9 < EMA21 · M5 тренд доош · RSI " + rsi;
     }
   else
     {
      gSignal = "NONE";
      if(rs >= 75)      gReason = "RSI " + rsi + " хэт өндөр — хүлээж байна";
      else if(rs <= 25) gReason = "RSI " + rsi + " хэт бага — хүлээж байна";
      else              gReason = "M1 болон M5 чиглэл таарахгүй байна — хүлээж байна";
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
   Print("XauBot: ажиллагаа дууслаа — ", reason);
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
   if(gTarget <= 0 || gMaxLoss <= 0) { gReason = "Багцын ашиг, алдагдлын дүн тохируулаагүй"; return; }
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
   if(lots < vmin) { gReason = "Лот брокерын доод хэмжээнээс бага байна"; return; }
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
         Print("XauBot: багцын захиалга амжилтгүй — ", trade.ResultRetcodeDescription());
         break;                                                  // брокер татгалзвал үлдсэнийг оролдохгүй
        }
     }
   gLastEntry = TimeCurrent();
   if(opened > 0)
     {
      gFirstEntry = TimeCurrent();
      gRunSide = side;
      gPlannedSeconds = 0;                                       // багцад хугацааны хязгаар байхгүй
      Print("XauBot: багц нээгдлээ — ", side, " ", (string)opened, " / ", (string)gMaxPos, " арилжаа, лот ", Num(lots, 2));
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
   if(lots < vmin) { gReason = "Лот брокерын доод хэмжээнээс бага байна"; return; }
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
      Print("XauBot: захиалга амжилтгүй — ", trade.ResultRetcodeDescription());
      return;
     }
   if(gFirstEntry <= 0)                                          // энэ удаагийн анхны арилжаа: чиглэл, хугацааг тогтооно
     {
      gFirstEntry = TimeCurrent();
      gRunSide = gSignal;
      gPlannedSeconds = PlanSeconds();
      Print("XauBot: ", gRunSide, " чиглэлд ", (string)gPlannedSeconds, " секунд ажиллахаар тооцлоо");
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
   datetime bar = iTime(_Symbol, PERIOD_M15, 0);
   if(bar == gRuleLastBar) return;                               // шинэ M15 лаа нээгдэхэд л шийднэ
   gRuleLastBar = bar;
   gSignal = "NONE";
   datetime closed = iTime(_Symbol, PERIOD_M15, 1);
   if(closed <= 0) { gReason = "Лааны дата ачаалж байна"; return; }
   datetime utc = closed - ServerUtcOffset(closed) * 3600;
   MqlDateTime u;
   TimeToStruct(utc, u);
   if(u.day_of_week == 0 || u.day_of_week == 6) { gReason = "Амралтын өдөр, зах хаалттай"; return; }
   datetime dayStart = closed - (u.hour * 3600 + u.min * 60 + u.sec);   // UTC 00:00, серверийн цагаар
   int trend = DailyTrend();
   string trendText = (trend > 0) ? "өдрийн тренд дээш" : ((trend < 0) ? "өдрийн тренд доош" : "өдрийн тренд тодорхойгүй");
   if(u.hour < 7) { gReason = "Азийн хүрээ бүрдэж байна · " + trendText; return; }

   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_M15, dayStart, closed, r);
   if(n <= 0) { gReason = "Лааны дата ачаалж байна"; return; }
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
   if(rangeBars < 20) { gReason = "Азийн хүрээний дата дутуу"; return; }
   string rangeText = "Хүрээ " + Num(lo, 2) + "-" + Num(hi, 2) + " · " + trendText;
   if(trend == 0) { gReason = rangeText; return; }
   if(RuleTradedSince(dayStart)) { gReason = rangeText + " · өнөөдрийн арилжаа хийгдсэн"; return; }
   if(u.hour >= 16) { gReason = rangeText + " · орох цонх хаагдсан"; return; }
   if(earlier) { gReason = rangeText + " · breakout өмнө нь гарсан, өнөөдөр орохгүй"; return; }
   if(!fresh) { gReason = rangeText + " · breakout хүлээж байна"; return; }

   // Саяхан хаагдсан лаа хүрээнээс трендийн чиглэлд гарлаа
   if(gState != "RUNNING") { gReason = rangeText + " · breakout гарсан, бот зогссон байсан"; return; }
   if(CountPositions() > 0) return;
   if(RealBlocked()) { gReason = "Жинхэнэ данс зөвшөөрөгдөөгүй"; return; }
   if(TimeLocal() - gLastSyncOk > 30) { gReason = "Вэбтэй холбоо тасарсан тул орсонгүй"; return; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { gReason = "Algo Trading унтраалттай тул орсонгүй"; return; }
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double dist = MathAbs(price - (hi + lo) / 2.0);
   if(RuleOpen(trend, dist, dist * 2.0, dayStart + 20 * 3600))
     {
      gSignal = (trend > 0) ? "BUY" : "SELL";
      gReason = rangeText + " · хүрээнээс гарлаа, орлоо";
      Print("XauBot: Азийн breakout — ", gSignal, " лот ", Num(RuleLots(), 2));
     }
   else
      gReason = rangeText + " · захиалга амжилтгүй: " + trade.ResultRetcodeDescription();
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
      gLinkStatus = "BotToken оруулаагүй";
      return;
     }
   string json = "{\"account\":{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"mode\":\"" + AccountModeStr() +
                 "\",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                 ",\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\"},\"symbol\":\"" + _Symbol + "\",\"bid\":" +
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
      gLinkStatus = (err == 4014) ? "URL зөвшөөрөгдөөгүй: Tools > Options > Expert Advisors > Allow WebRequest" : "холболтын алдаа " + (string)err;
      return;
     }
   if(code == 401) { gLinkStatus = "токен буруу"; return; }
   if(code != 200) { gLinkStatus = "серверийн хариу " + (string)code; return; }

   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   gLastSyncOk = TimeLocal();
   gLinkStatus = "холбогдсон";

   string state = JStr(body, "state");
   string runId = JStr(body, "runId");
   gCloseAll   = JBool(body, "closeAll");
   gLots       = JNum(body, "lots");
   gMaxPos     = (int)JNum(body, "maxPositions");
   gSlAtr      = JNum(body, "slAtr");
   gTpAtr      = JNum(body, "tpAtr");
   gTarget     = JNum(body, "profitTarget");
   gMaxLoss    = JNum(body, "maxLoss");
   string mode = JStr(body, "mode");
   string newMode = (mode == "BASKET") ? "BASKET" : ((mode == "ASIAN") ? "ASIAN" : "SCALPER");
   if(newMode != gMode) gRuleLastBar = 0;
   gMode       = newMode;

   if(state == "RUNNING" && runId != "" && runId != gActiveRunId)   // шинэ ажиллагаа эхэллээ
     {
      BeginRun(runId);
      Print("XauBot: Start (", gMode, ") — лот ", Num(gLots, 2), ", арилжаа ", (string)gMaxPos);
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
   string s = "XauBot · " + AccountModeStr() + " данс · вэб: " + gLinkStatus + "\n";
   s += "Төлөв: " + (gState == "RUNNING" ? (gFinished == "" ? "АЖИЛЛАЖ БАЙНА" : "дуусгаж байна (" + gFinished + ")") : "зогссон") + "\n";
   s += "Хэрэгсэл: " + (gMode == "BASKET" ? "Багц" : (gMode == "ASIAN" ? "Азийн breakout" : "Scalper")) + "\n";
   s += "Дохио: " + gSignal + " — " + gReason + "\n";
   s += "Нээлттэй: " + (string)CountPositions() + " / " + (string)gMaxPos + " · лот " + Num(gLots, 2);
   if(gState == "RUNNING") s += " · энэ удаа: " + Num(RunPnl(), 2);
   if(gState == "RUNNING" && gMode == "BASKET" && gFirstEntry > 0) s += "\nБагц (" + gRunSide + "): +" + Num(gTarget, 2) + " хүрвэл эсвэл -" + Num(gMaxLoss, 2) + " хүрвэл бүгдийг хаана";
   if(gState == "RUNNING" && gMode != "BASKET" && gFirstEntry > 0) s += "\nХугацаа: " + (string)ElapsedSeconds() + " / " + (string)gPlannedSeconds + " сек (" + gRunSide + ")";
   if(gState == "RUNNING" && gFirstEntry <= 0) s += "\nЭхний дохиог хүлээж байна";
   if(RealBlocked()) s += "\nЖИНХЭНЭ ДАНС: AllowRealAccount унтраалттай тул арилжаа хийхгүй";
   Comment(s);
  }
//+------------------------------------------------------------------+

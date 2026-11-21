//+------------------------------------------------------------------+
//| XauBot.mq5 — XAU Analytics-ийн вэб самбараас удирддаг робот      |
//| Арилжааг энэ робот брокерын бодит цагийн үнээр өөрөө хийнэ.      |
//| Вэб самбар: тохиргоо, Start/Stop, хяналт.                        |
//| АНХААР: Scalper арга шалгагдаагүй. Ашиг баталгаагүй.             |
//+------------------------------------------------------------------+
#property copyright "XAU Analytics"
#property version   "1.00"
#property description "Web-controlled scalper. Demo by default; real accounts need AllowRealAccount AND the switch on the web."

#include <Trade\Trade.mqh>

input string ServerUrl            = "https://xau-analytics-production.up.railway.app/api/bot/sync"; // Вэб самбар дээрх хаяг
input string BotToken             = "";       // Вэб самбар дээр үүсгэсэн токен
input bool   AllowRealAccount     = false;    // Жинхэнэ данс дээр арилжаа хийхийг зөвшөөрөх
input long   MagicNumber          = 20261121; // Энэ роботын арилжааг ялгах дугаар
input int    SyncSeconds          = 1;        // Вэбтэй холбогдох давтамж (секунд)
input int    EntryCooldownSeconds = 5;        // Хоёр арилжааны хоорондох хамгийн бага зай (секунд)
input int    MaxSpreadPoints      = 600;      // Spread үүнээс их бол орохгүй (point)

CTrade trade;
int    hEmaFast = INVALID_HANDLE, hEmaSlow = INVALID_HANDLE, hEmaTrend = INVALID_HANDLE, hRsi = INVALID_HANDLE, hAtr = INVALID_HANDLE;

// серверээс ирсэн тушаал
string gState = "STOPPED";
string gRunId = "";
double gLots = 0.01, gSlAtr = 1.5, gTpAtr = 2.0, gTarget = 0.0, gMaxLoss = 0.0;
int    gMaxPos = 1;
bool   gCloseAll = false;

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

//+------------------------------------------------------------------+
int OnInit()
  {
   hEmaFast  = iMA(_Symbol, PERIOD_M1, 9, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow  = iMA(_Symbol, PERIOD_M1, 21, 0, MODE_EMA, PRICE_CLOSE);
   hEmaTrend = iMA(_Symbol, PERIOD_M5, 50, 0, MODE_EMA, PRICE_CLOSE);
   hRsi      = iRSI(_Symbol, PERIOD_M1, 7, PRICE_CLOSE);
   hAtr      = iATR(_Symbol, PERIOD_M1, 14);
   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hEmaTrend == INVALID_HANDLE || hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE)
     {
      Print("XauBot: индикатор үүсгэж чадсангүй");
      return(INIT_FAILED);
     }
   if(StringLen(BotToken) == 0)
      Print("XauBot: BotToken хоосон байна — вэб самбар дээр токен үүсгээд энд оруулна уу");
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFillingBySymbol(_Symbol);
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
   Comment("");
  }

void OnTimer()
  {
   EvaluateSignal();
   ManageRun();
   Sync();
   ShowStatus();
  }

void OnTick()
  {
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
   if(gSignal != "NONE" && gSignal != gRunSide) { Finish("REVERSAL"); return; }   // чиглэл эргэлээ
   if(ElapsedSeconds() >= gPlannedSeconds)      { Finish("TIME");     return; }   // тооцсон хугацаа дууслаа
  }

//+------------------------------------------------------------------+
//| Арилжаа нээх                                                     |
//+------------------------------------------------------------------+
void TryEnter()
  {
   if(gState != "RUNNING" || gFinished != "" || gSignal == "NONE") return;
   if(gRunSide != "" && gSignal != gRunSide) return;                // нэг удаад нэг чиглэлд л ажиллана
   if(RealBlocked()) return;
   if(TimeLocal() - gLastSyncOk > 30) return;                    // вэбтэй холбоо тасарсан үед шинээр нээхгүй
   if(TimeCurrent() - gLastEntry < EntryCooldownSeconds) return;
   if(CountPositions() >= gMaxPos) return;
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
                 ",\"positions\":[" + PositionsJson() + "],\"deals\":[" + DealsJson() + "],\"finished\":\"" + gFinished + "\",\"plannedSeconds\":" + (string)gPlannedSeconds + ",\"elapsedSeconds\":" + (string)ElapsedSeconds() + "}";

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

   if(state == "RUNNING" && runId != "" && runId != gActiveRunId)   // шинэ ажиллагаа эхэллээ
     {
      gActiveRunId = runId;
      gRunStart = TimeCurrent();
      gFinished = "";
      gLastEntry = 0;
      gFirstEntry = 0;
      gRunSide = "";
      gPlannedSeconds = 0;
      Print("XauBot: Start — лот ", Num(gLots, 2), ", зэрэг ", (string)gMaxPos);
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
   s += "Дохио: " + gSignal + " — " + gReason + "\n";
   s += "Нээлттэй: " + (string)CountPositions() + " / " + (string)gMaxPos + " · лот " + Num(gLots, 2);
   if(gState == "RUNNING") s += " · энэ удаа: " + Num(RunPnl(), 2);
   if(gState == "RUNNING" && gFirstEntry > 0) s += "\nХугацаа: " + (string)ElapsedSeconds() + " / " + (string)gPlannedSeconds + " сек (" + gRunSide + ")";
   if(gState == "RUNNING" && gFirstEntry <= 0) s += "\nЭхний дохиог хүлээж байна";
   if(RealBlocked()) s += "\nЖИНХЭНЭ ДАНС: AllowRealAccount унтраалттай тул арилжаа хийхгүй";
   Comment(s);
  }
//+------------------------------------------------------------------+

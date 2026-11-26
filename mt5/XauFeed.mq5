//+------------------------------------------------------------------+
//|                                                      XauFeed.mq5 |
//|                             XAU Analytics — Live Price Feeder EA |
//|                                         https://xau.example.com  |
//+------------------------------------------------------------------+
#property copyright   "XAU Analytics"
#property link        "https://xau.example.com"
#property version     "1.10"
#property description "Dedicated Live Price Feeder EA for MetaTrader 5."
#property description "Streams real-time gold (XAUUSD) bid, ask, and spread to the XAU Analytics web dashboard."
#property description "Zero trading permissions needed. 100% safe for demo, real, or investor accounts."

//--- Inputs
input group "=== Вэб холболтын тохиргоо · Server Configuration ==="
input string ServerUrl            = "https://web-production-4f0081ec.up.railway.app/api/feed/tick"; // Вэбийн хаяг: /api/feed/tick (XauBot-той мөргөлдөхгүй) · Web address
input string AdminToken           = "";                                                             // Админ / Ботын токен · Admin/Bot Token

input group "=== Давтамж ба Оновчлол · Timing & Optimization ==="
input int    ThrottleMs           = 500;  // Илгээх доод завсар (мс) · Min interval between ticks (ms)
input int    HeartbeatSec         = 3;    // Хөдөлгөөнгүй үед шалгах (сек) · Keep-alive heartbeat (s)
input bool   ShowDashboard        = true; // Чарт дээр мэдээлэл харуулах · Show status on chart

//--- Global Variables
ulong    gLastSendTick  = 0;
datetime gLastSendTime  = 0;
ulong    gTicksSent     = 0;
ulong    gErrors        = 0;
int      gLastLatencyMs = 0;
string   gLastStatus    = "ЭХЭЛЖ БАЙНА · INITIALIZING";
double   gLastBid       = 0.0;
double   gLastAsk       = 0.0;
datetime gStartTime     = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   gStartTime = TimeCurrent();
   gLastSendTick = 0;
   gLastSendTime = 0;
   gTicksSent = 0;
   gErrors = 0;

   // Эхний үнийг уншиж дэлгэцэнд бэлтгэх
   MqlTick tick;
   if(SymbolInfoTick(_Symbol, tick))
     {
      gLastBid = tick.bid;
      gLastAsk = tick.ask;
     }

   // 1 секундын таймер ажиллуулах (Heartbeat болон дэлгэцийн шинэчлэлд)
   EventSetTimer(1);

   PrintFormat("[XauFeed] Асаалаа: %s. Холбогдох хаяг: %s", _Symbol, ServerUrl);

   if(StringLen(AdminToken) == 0)
     {
      Print("[XauFeed] АНХААР: AdminToken хоосон байна! Вэб самбараас админ токеноо авч Inputs дээр оруулна уу.");
      gLastStatus = "ТОКЕН БАЙХГҮЙ · MISSING TOKEN";
     }
   else
     {
      gLastStatus = "ХОЛБОГДОЖ БАЙНА · CONNECTING";
     }

   UpdateDashboard();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
   Print("[XauFeed] Зогслоо. Шалтгаан код: ", reason);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   // Үнийг дэлгэцэнд нэн даруй шинэчлэх
   gLastBid = tick.bid;
   gLastAsk = tick.ask;

   ulong currentTick = GetTickCount64();

   // Илгээх хугацааны хязгаарлалт (Throttle)
   if(currentTick - gLastSendTick < (ulong)ThrottleMs)
      return;

   SendTickData(tick, false);
  }

//+------------------------------------------------------------------+
//| Timer function (Heartbeat & Dashboard Refresh)                   |
//+------------------------------------------------------------------+
void OnTimer()
  {
   datetime now = TimeCurrent();

   MqlTick tick;
   if(SymbolInfoTick(_Symbol, tick))
     {
      gLastBid = tick.bid;
      gLastAsk = tick.ask;

      // Хэрэв үнэ хэсэг хугацаанд өөрчлөгдөөгүй бол Heartbeat илгээх
      if(now - gLastSendTime >= HeartbeatSec)
        {
         SendTickData(tick, true);
        }
     }

   UpdateDashboard();
  }

//+------------------------------------------------------------------+
//| Escape text for JSON                                             |
//+------------------------------------------------------------------+
string JsonSafe(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return s;
  }

//+------------------------------------------------------------------+
//| Send tick to web server via WebRequest                           |
//+------------------------------------------------------------------+
bool SendTickData(const MqlTick &tick, bool isHeartbeat)
  {
   string cleanToken = AdminToken;
   StringTrimLeft(cleanToken);
   StringTrimRight(cleanToken);

   string cleanUrl = ServerUrl;
   StringTrimLeft(cleanUrl);
   StringTrimRight(cleanUrl);

   if(StringLen(cleanToken) == 0 || StringLen(cleanUrl) == 0)
      return false;

   if(tick.bid <= 0 || tick.ask <= 0)
      return false;

   string serverName = AccountInfoString(ACCOUNT_SERVER);
   double spread = tick.ask - tick.bid;
   string json = "";

   // Хэрэв серверийн хаяг /api/bot/sync бол бүрэн нийцтэй Report бүтцээр илгээнэ
   if(StringFind(cleanUrl, "/api/bot/sync") >= 0)
     {
      string mode = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL) ? "REAL" : "DEMO";
      long login = AccountInfoInteger(ACCOUNT_LOGIN);
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      string currency = AccountInfoString(ACCOUNT_CURRENCY);
      if(StringLen(currency) == 0) currency = "USD";

      json = StringFormat(
         "{\"account\":{\"login\":\"%I64d\",\"mode\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"server\":\"%s\"},"
         "\"symbol\":\"%s\",\"bid\":%.3f,\"ask\":%.3f,\"signal\":\"NONE\",\"reason\":\"Live price bridge\","
         "\"runPnl\":0.00,\"positions\":[],\"deals\":[],\"finished\":\"\",\"plannedSeconds\":0,\"elapsedSeconds\":0,\"version\":11,"
         "\"gateOn\":false,\"block\":\"\",\"blockDetail\":\"\",\"tradesToday\":0,\"dayPnl\":0.00,\"dailyLossHit\":false}",
         login, mode, balance, equity, currency, JsonSafe(serverName),
         _Symbol, tick.bid, tick.ask
      );
     }
   else
     {
      // /api/feed/tick болон бусад цэвэр tick хүлээн авагчид
      json = StringFormat(
         "{\"symbol\":\"%s\",\"bid\":%.3f,\"ask\":%.3f,\"spread\":%.3f,\"server\":\"%s\"}",
         _Symbol, tick.bid, tick.ask, spread, JsonSafe(serverName)
      );
     }

   uchar postData[];
   int len = StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(len <= 1) return false;
   ArrayResize(postData, len - 1); // null terminator-ийг хасах

   string headers = "Content-Type: application/json\r\nX-Bot-Token: " + cleanToken + "\r\n";

   uchar  result[];
   string resultHeaders;
   ulong  startMs = GetTickCount64();

   ResetLastError();
   int res = WebRequest("POST", cleanUrl, headers, 4000, postData, result, resultHeaders);
   ulong latency = GetTickCount64() - startMs;
   gLastLatencyMs = (int)latency;

   if(res == 200)
     {
      gTicksSent++;
      gLastSendTick = GetTickCount64();
      gLastSendTime = TimeCurrent();
      gLastStatus = isHeartbeat ? "ИДЭВХТЭЙ (HEARTBEAT OK)" : "ИДЭВХТЭЙ (LIVE OK)";
      return true;
     }
   else
     {
      gErrors++;
      int err = GetLastError();
      if(err == 4014) // ERR_WEBREQUEST_NOT_ALLOWED
        {
         gLastStatus = "АЛДАА: Tools -> Options -> Allow WebRequest дотор URL нэмнэ үү!";
        }
      else if(res == 401 || res == 403)
        {
         gLastStatus = "АЛДАА: Токен буруу эсвэл админ эрхгүй байна (HTTP 401/403)";
        }
      else if(res == 400)
        {
         gLastStatus = StringFormat("СЕРВЕР АЛДАА: HTTP 400 (Дата формат таарсангүй)", res);
        }
      else if(res > 0)
        {
         gLastStatus = StringFormat("СЕРВЕР АЛДАА: HTTP %d (%d мс)", res, gLastLatencyMs);
        }
      else
        {
         gLastStatus = StringFormat("ХОЛБОЛТЫН АЛДАА: MQL код %d (%s)", err, ServerUrl);
        }
      return false;
     }
  }

//+------------------------------------------------------------------+
//| Update chart display                                             |
//+------------------------------------------------------------------+
void UpdateDashboard()
  {
   if(!ShowDashboard)
     {
      Comment("");
      return;
     }

   int uptimeSec = (int)(TimeCurrent() - gStartTime);
   int hours = uptimeSec / 3600;
   int mins = (uptimeSec % 3600) / 60;
   int secs = uptimeSec % 60;

   string text = "\n";
   text += "=================================================\n";
   text += "   ✦ XAU ANALYTICS — LIVE PRICE FEED BRIDGE ✦   \n";
   text += "=================================================\n";
   text += StringFormat("  Төлөв / Status:    %s\n", gLastStatus);
   text += StringFormat("  Хэрэгсэл / Symbol: %s | Server: %s\n", _Symbol, AccountInfoString(ACCOUNT_SERVER));
   text += StringFormat("  Үнэ / Price:       Bid: %.2f | Ask: %.2f (Spread: %.2f)\n", gLastBid, gLastAsk, gLastAsk - gLastBid);
   text += StringFormat("  Амжилттай / Sent:  %I64u тийк | Алдаа: %I64u\n", gTicksSent, gErrors);
   text += StringFormat("  Хоцролт / Latency: %d мс\n", gLastLatencyMs);
   text += StringFormat("  Хугацаа / Uptime:  %02d:%02d:%02d\n", hours, mins, secs);
   text += StringFormat("  Вэб хаяг / URL:    %s\n", ServerUrl);
   text += "=================================================\n";
   text += "  Зөвлөмж: MT5-ийн Tools -> Options -> Expert Advisors\n";
   text += "  хэсэгт Allow WebRequest чагталж дээрх URL-ийг оруулна.\n";
   text += "=================================================\n";

   Comment(text);
  }
//+------------------------------------------------------------------+

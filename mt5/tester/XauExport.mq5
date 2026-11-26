//+------------------------------------------------------------------+
//| XauExport: Strategy Tester-ээр ажиллуулахад брокерын M15, H4, D1  |
//| лааг (серверийн цагаар) Common\Files\xau_<tf>.csv руу бичнэ.     |
//| Судалгаанд (scripts/broker-research.ts) зориулсан, арилжаа хийхгүй.|
//+------------------------------------------------------------------+
#property version "1.00"

int fM15 = INVALID_HANDLE, fH4 = INVALID_HANDLE, fD1 = INVALID_HANDLE;
datetime lM15 = 0, lH4 = 0, lD1 = 0;

int OpenOut(const string tf)
  {
   int h = FileOpen("xau_" + tf + ".csv", FILE_WRITE | FILE_ANSI | FILE_COMMON | FILE_TXT);
   if(h != INVALID_HANDLE) FileWriteString(h, "time,open,high,low,close\n");
   return(h);
  }

int OnInit()
  {
   fM15 = OpenOut("m15"); fH4 = OpenOut("h4"); fD1 = OpenOut("d1");
   return((fM15 == INVALID_HANDLE || fH4 == INVALID_HANDLE || fD1 == INVALID_HANDLE) ? INIT_FAILED : INIT_SUCCEEDED);
  }

// Шинэ лаа нээгдэхэд өмнөх (хаагдсан) лааг бичнэ
void Dump(const int f, const ENUM_TIMEFRAMES tf, datetime &last)
  {
   datetime t = iTime(_Symbol, tf, 0);
   if(t == last) return;
   last = t;
   MqlRates r[];
   if(CopyRates(_Symbol, tf, 1, 1, r) != 1) return;
   FileWriteString(f, StringFormat("%I64d,%.2f,%.2f,%.2f,%.2f\n", (long)r[0].time, r[0].open, r[0].high, r[0].low, r[0].close));
  }

void OnTick()
  {
   Dump(fM15, PERIOD_M15, lM15);
   Dump(fH4, PERIOD_H4, lH4);
   Dump(fD1, PERIOD_D1, lD1);
  }

void OnDeinit(const int reason)
  {
   if(fM15 != INVALID_HANDLE) FileClose(fM15);
   if(fH4 != INVALID_HANDLE) FileClose(fH4);
   if(fD1 != INVALID_HANDLE) FileClose(fD1);
  }

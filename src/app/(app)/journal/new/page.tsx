import { TradeForm } from "@/components/TradeForm";
import { toUbInput } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Арилжаа нэмэх — XAU Analytics" };

export default function NewTradePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Арилжаа нэмэх</h1>
      <TradeForm initial={{ direction: "BUY", lots: "", entryPrice: "", exitPrice: "", stopLoss: "", takeProfit: "", openedAt: toUbInput(new Date()), closedAt: "", note: "", hasImage: false }} />
    </div>
  );
}

/**
 * Execution engine placeholder.
 * In later phases this will:
 * - receive TradingView webhook signals
 * - run risk checks
 * - route orders to IB / Avanza adapters
 */
export type Signal = {
  action: "BUY" | "SELL" | "CLOSE";
  symbol: string;
  price?: number;
  time?: string;
};

export async function handleSignal(signal: Signal) {
  // TODO: implement in Fas 7+
  console.log("Received signal:", signal);
}

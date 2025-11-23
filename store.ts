/**
 * State store placeholder.
 * Later will persist positions, orders, last signals, equity snapshots, etc.
 */
export type Position = {
  symbol: string;
  qty: number;
  avgPrice: number;
};

export const state = {
  positions: [] as Position[],
  openOrders: [],
  lastSignals: {} as Record<string, any>,
};

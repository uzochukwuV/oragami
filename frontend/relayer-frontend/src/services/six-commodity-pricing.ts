/**
 * SIX Commodity Pricing Service
 * 
 * Provides commodity price data from SIX Swiss Exchange for vault collateralization tracking.
 * In production, this would integrate with SIX's market data API.
 * For devnet, uses simulated prices based on reference rates.
 */

import { API_BASE_URL } from '@/lib/constants';

// ============================================================================
// Types
// ============================================================================

export interface CommodityPrice {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  timestamp: number;
  change24h: number;
  changePercent24h: number;
}

export interface CommodityIndex {
  name: string;
  value: number;
  components: CommodityPrice[];
  timestamp: number;
}

export interface PriceQuote {
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  timestamp: number;
}

export interface VaultCollateralValue {
  totalValue: number;
  breakdown: {
    commodity: string;
    quantity: number;
    value: number;
    percentage: number;
  }[];
  timestamp: number;
}

// ============================================================================
// Reference Commodity Data
// ============================================================================

const COMMODITY_SYMBOLS = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  CRUDE_OIL: 'CL',
  NATURAL_GAS: 'NG',
  COPPER: 'HG',
  WHEAT: 'W',
} as const;

const COMMODITY_NAMES: Record<string, string> = {
  XAU: 'Gold',
  XAG: 'Silver',
  XPT: 'Platinum',
  XPD: 'Palladium',
  CL: 'Crude Oil',
  NG: 'Natural Gas',
  HG: 'Copper',
  W: 'Wheat',
};

// Reference prices (USD) - simulated for devnet
const REFERENCE_PRICES: Record<string, number> = {
  XAU: 2450.50,
  XAG: 28.75,
  XPT: 980.30,
  XPD: 1050.80,
  CL: 78.50,
  NG: 3.25,
  HG: 4.15,
  W: 6.85,
};

// ============================================================================
// Price Service
// ============================================================================

/**
 * Fetch current commodity prices from SIX
 * In production: calls SIX API
 * Devnet: returns simulated data
 */
export async function fetchCommodityPrices(
  symbols?: string[]
): Promise<CommodityPrice[]> {
  const targetSymbols = symbols || Object.values(COMMODITY_SYMBOLS);
  
  // Try backend pricing endpoint first
  try {
    const response = await fetch(`${API_BASE_URL}/api/vault/prices?symbols=${targetSymbols.join(',')}`);
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Fall back to local simulation
  }

  // Simulated prices with small random variance
  return targetSymbols.map((symbol) => {
    const basePrice = REFERENCE_PRICES[symbol] || 100;
    const variance = (Math.random() - 0.5) * basePrice * 0.01; // ±0.5% variance
    const price = basePrice + variance;
    const change = (Math.random() - 0.5) * basePrice * 0.02; // ±1% daily change

    return {
      symbol,
      name: COMMODITY_NAMES[symbol] || symbol,
      price: Math.round(price * 100) / 100,
      currency: 'USD',
      timestamp: Date.now(),
      change24h: Math.round(change * 100) / 100,
      changePercent24h: Math.round((change / basePrice) * 10000) / 100,
    };
  });
}

/**
 * Fetch a single commodity price
 */
export async function fetchCommodityPrice(symbol: string): Promise<CommodityPrice | null> {
  const prices = await fetchCommodityPrices([symbol]);
  return prices[0] || null;
}

/**
 * Get real-time price quote with bid/ask spread
 */
export async function getPriceQuote(symbol: string): Promise<PriceQuote> {
  const price = REFERENCE_PRICES[symbol] || 100;
  const spread = price * 0.001; // 0.1% spread

  // Try backend first
  try {
    const response = await fetch(`${API_BASE_URL}/api/vault/quote/${symbol}`);
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Fall back to simulation
  }

  return {
    bid: Math.round((price - spread / 2) * 100) / 100,
    ask: Math.round((price + spread / 2) * 100) / 100,
    last: price,
    volume24h: Math.floor(Math.random() * 1000000),
    timestamp: Date.now(),
  };
}

/**
 * Get SIX Commodity Index (basket of commodities)
 */
export async function getCommodityIndex(): Promise<CommodityIndex> {
  const prices = await fetchCommodityPrices();
  
  // Calculate weighted index value
  const weights: Record<string, number> = {
    XAU: 0.30,  // Gold 30%
    XAG: 0.15,  // Silver 15%
    XPT: 0.10,  // Platinum 10%
    XPD: 0.10,  // Palladium 10%
    CL: 0.15,   // Crude Oil 15%
    NG: 0.05,   // Natural Gas 5%
    HG: 0.10,   // Copper 10%
    W: 0.05,    // Wheat 5%
  };

  let indexValue = 0;
  for (const price of prices) {
    const weight = weights[price.symbol] || 0;
    // Normalize to base 1000
    const basePrice = REFERENCE_PRICES[price.symbol] || 1;
    indexValue += (price.price / basePrice) * weight * 1000;
  }

  return {
    name: 'SIX Commodity Index',
    value: Math.round(indexValue * 100) / 100,
    components: prices,
    timestamp: Date.now(),
  };
}

/**
 * Calculate vault collateral value based on commodity holdings
 */
export async function calculateCollateralValue(
  holdings: { symbol: string; quantity: number }[]
): Promise<VaultCollateralValue> {
  const prices = await fetchCommodityPrices(holdings.map((h) => h.symbol));

  const priceMap: Record<string, number> = {};
  for (const p of prices) {
    priceMap[p.symbol] = p.price;
  }

  let totalValue = 0;
  const breakdown = holdings.map((holding) => {
    const price = priceMap[holding.symbol] || 0;
    const value = holding.quantity * price;
    totalValue += value;
    return {
      commodity: COMMODITY_NAMES[holding.symbol] || holding.symbol,
      quantity: holding.quantity,
      value: Math.round(value * 100) / 100,
      percentage: 0, // Will be calculated after total
    };
  });

  // Calculate percentages
  for (const item of breakdown) {
    item.percentage = totalValue > 0 ? Math.round((item.value / totalValue) * 10000) / 100 : 0;
  }

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    breakdown,
    timestamp: Date.now(),
  };
}

/**
 * Get historical prices for a commodity
 * @param symbol - Commodity symbol
 * @param days - Number of days of history
 */
export async function getHistoricalPrices(
  symbol: string,
  days: number = 30
): Promise<{ date: string; price: number }[]> {
  // Try backend first
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/vault/prices/history?symbol=${symbol}&days=${days}`
    );
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Fall back to simulation
  }

  // Generate simulated historical data
  const basePrice = REFERENCE_PRICES[symbol] || 100;
  const history: { date: string; price: number }[] = [];

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const variance = (Math.random() - 0.5) * basePrice * 0.05; // ±5% variance
    const trend = (days - i) * (basePrice * 0.001); // Slight trend
    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.round((basePrice + variance + trend) * 100) / 100,
    });
  }

  return history;
}

/**
 * Get commodity allocation recommendations based on risk profile
 */
export function getRecommendedAllocation(
  riskProfile: 'conservative' | 'moderate' | 'aggressive'
): { symbol: string; weight: number }[] {
  const allocations: Record<string, { symbol: string; weight: number }[]> = {
    conservative: [
      { symbol: 'XAU', weight: 50 },
      { symbol: 'XAG', weight: 20 },
      { symbol: 'XPT', weight: 15 },
      { symbol: 'XPD', weight: 15 },
    ],
    moderate: [
      { symbol: 'XAU', weight: 30 },
      { symbol: 'XAG', weight: 15 },
      { symbol: 'XPT', weight: 10 },
      { symbol: 'XPD', weight: 10 },
      { symbol: 'CL', weight: 15 },
      { symbol: 'HG', weight: 10 },
      { symbol: 'NG', weight: 5 },
      { symbol: 'W', weight: 5 },
    ],
    aggressive: [
      { symbol: 'XAU', weight: 20 },
      { symbol: 'CL', weight: 25 },
      { symbol: 'HG', weight: 20 },
      { symbol: 'NG', weight: 15 },
      { symbol: 'XAG', weight: 10 },
      { symbol: 'W', weight: 10 },
    ],
  };

  return allocations[riskProfile];
}

/**
 * Get market status (is SIX currently trading?)
 */
export function getMarketStatus(): { isOpen: boolean; nextOpen?: string; nextClose?: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  // SIX trading hours: Mon-Fri 8:00-17:30 CET (7:00-16:30 UTC)
  const isWeekday = day >= 1 && day <= 5;
  const isTradingHour = hour >= 7 && hour < 16;

  if (isWeekday && isTradingHour) {
    return { isOpen: true };
  }

  // Calculate next open
  const nextOpen = new Date(now);
  if (!isWeekday || hour >= 16) {
    // Next Monday
    const daysUntilMonday = (8 - day) % 7 || 7;
    nextOpen.setDate(now.getDate() + daysUntilMonday);
  }
  nextOpen.setUTCHours(7, 0, 0, 0);

  // Calculate next close (today at 16:30 UTC if trading)
  const nextClose = new Date(now);
  nextClose.setUTCHours(16, 30, 0, 0);

  return {
    isOpen: false,
    nextOpen: nextOpen.toISOString(),
    nextClose: isWeekday && hour < 16 ? nextClose.toISOString() : undefined,
  };
}

// ============================================================================
// Constants
// ============================================================================

export { COMMODITY_SYMBOLS, COMMODITY_NAMES };

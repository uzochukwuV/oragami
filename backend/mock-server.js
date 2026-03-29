/**
 * Mock Vault Pricing Server
 * Simple Express server to serve vault pricing endpoints for frontend testing
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8000;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Reference commodity prices
const REFERENCE_PRICES = {
  XAU: { price: 2450.50, name: 'Gold' },
  XAG: { price: 28.75, name: 'Silver' },
  XPT: { price: 980.30, name: 'Platinum' },
  XPD: { price: 1050.80, name: 'Palladium' },
  CL: { price: 78.50, name: 'Crude Oil' },
  NG: { price: 3.25, name: 'Natural Gas' },
  HG: { price: 4.15, name: 'Copper' },
  W: { price: 6.85, name: 'Wheat' },
};

// Helper function to add variance to prices
function addVariance(price, maxVariance = 0.01) {
  const variance = (Math.random() - 0.5) * 2 * price * maxVariance;
  return Math.round((price + variance) * 100) / 100;
}

// GET /api/vault/prices
app.get('/api/vault/prices', (req, res) => {
  const symbols = req.query.symbols ? req.query.symbols.split(',') : Object.keys(REFERENCE_PRICES);

  const prices = symbols.map(symbol => {
    const base = REFERENCE_PRICES[symbol];
    if (!base) return null;

    const price = addVariance(base.price);
    const change = addVariance(base.price * 0.02, 0.5);

    return {
      symbol,
      name: base.name,
      price,
      currency: 'USD',
      timestamp: Date.now(),
      change_24h: change,
      change_percent_24h: Math.round((change / base.price) * 10000) / 100,
    };
  }).filter(Boolean);

  res.json({
    success: true,
    data: prices,
    error: null,
  });
});

// GET /api/vault/quote/:symbol
app.get('/api/vault/quote/:symbol', (req, res) => {
  const { symbol } = req.params;
  const base = REFERENCE_PRICES[symbol];

  if (!base) {
    return res.status(404).json({
      success: false,
      data: null,
      error: `Unknown symbol: ${symbol}`,
    });
  }

  const spread = base.price * 0.001;
  const last = addVariance(base.price);

  res.json({
    success: true,
    data: {
      bid: Math.round((last - spread / 2) * 100) / 100,
      ask: Math.round((last + spread / 2) * 100) / 100,
      last,
      volume_24h: Math.floor(Math.random() * 1000000),
      timestamp: Date.now(),
    },
    error: null,
  });
});

// GET /api/vault/prices/history
app.get('/api/vault/prices/history', (req, res) => {
  const { symbol, days = 30 } = req.query;
  const base = REFERENCE_PRICES[symbol];

  if (!base) {
    return res.status(404).json({
      success: false,
      data: null,
      error: `Unknown symbol: ${symbol}`,
    });
  }

  const history = [];
  for (let i = parseInt(days); i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const variance = (Math.random() - 0.5) * base.price * 0.05;
    const trend = (parseInt(days) - i) * (base.price * 0.001);

    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.round((base.price + variance + trend) * 100) / 100,
    });
  }

  res.json({
    success: true,
    data: history,
    error: null,
  });
});

// GET /api/vault/tvl
app.get('/api/vault/tvl', (req, res) => {
  res.json({
    success: true,
    data: {
      total_deposits: 1500000,
      total_supply: 1500000,
      usx_allocation_bps: 7000,
      usx_allocated: 1050000,
      pending_yield: 150,
      last_yield_claim: Math.floor(Date.now() / 1000) - 86400,
    },
    error: null,
  });
});

// GET /api/vault/status
app.get('/api/vault/status', (req, res) => {
  res.json({
    success: true,
    data: {
      paused: false,
      six_connected: true,
      secondary_market_enabled: false,
      network: 'devnet',
    },
    error: null,
  });
});

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

app.get('/health/ready', (req, res) => {
  res.json({ status: 'ready' });
});

// SIX endpoints (mock)
app.get('/six/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'healthy' },
    error: null,
  });
});

app.get('/six/metal/:metal', (req, res) => {
  const { metal } = req.params;
  const symbol = metal.toUpperCase() === 'GOLD' ? 'XAU' :
                 metal.toUpperCase() === 'SILVER' ? 'XAG' :
                 metal.toUpperCase() === 'PLATINUM' ? 'XPT' :
                 metal.toUpperCase() === 'PALLADIUM' ? 'XPD' : null;

  const base = symbol ? REFERENCE_PRICES[symbol] : null;

  if (!base) {
    return res.status(404).json({
      success: false,
      data: null,
      error: `Unknown metal: ${metal}`,
    });
  }

  res.json({
    success: true,
    data: {
      metal: metal.toUpperCase(),
      price_per_oz: addVariance(base.price),
      currency: 'USD',
      timestamp: Math.floor(Date.now() / 1000),
    },
    error: null,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock vault pricing server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/vault/prices?symbols=XAU,XAG');
  console.log('  GET /api/vault/quote/:symbol');
  console.log('  GET /api/vault/prices/history?symbol=XAU&days=30');
  console.log('  GET /api/vault/tvl');
  console.log('  GET /api/vault/status');
  console.log('  GET /health');
});

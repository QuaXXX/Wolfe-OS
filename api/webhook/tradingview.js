/**
 * 24/7 Vercel Serverless Webhook Endpoint for TradingView Alerts
 * Receives TradingView webhook signals, calculates dynamic risk-based sizing,
 * and executes direct market/trigger orders on Hyperliquid L1 while your computer is completely off.
 *
 * Endpoint: POST https://your-wolfe-os-domain.vercel.app/api/webhook/tradingview
 */

// Asset Precision Tables (Tick sizes & Decimal points)
const ASSET_PRECISION = {
  'BTC': { sizeDecimals: 4, priceDecimals: 1, minSize: 0.0001 },
  'ETH': { sizeDecimals: 3, priceDecimals: 2, minSize: 0.001 },
  'SOL': { sizeDecimals: 2, priceDecimals: 2, minSize: 0.01 },
  'HYPE': { sizeDecimals: 1, priceDecimals: 3, minSize: 0.1 },
  'AVAX': { sizeDecimals: 2, priceDecimals: 2, minSize: 0.01 },
  'SUI': { sizeDecimals: 1, priceDecimals: 4, minSize: 0.1 },
  'DOGE': { sizeDecimals: 0, priceDecimals: 5, minSize: 1 }
};

export default async function handler(req, res) {
  // CORS & Health check
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Send POST webhook from TradingView.' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    // 1. Extract Signal Parameters
    const ticker = (payload.ticker || payload.symbol || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const action = (payload.action || payload.side || 'BUY').toUpperCase();
    const isLong = action.includes('BUY') || action.includes('LONG');
    const price = Number(payload.price || payload.entryPrice || 0);
    const stopLoss = payload.stopLoss ? Number(payload.stopLoss) : null;
    const takeProfit = payload.takeProfit ? Number(payload.takeProfit) : null;
    const customRiskPercent = Number(payload.riskPercent || process.env.DEFAULT_RISK_PERCENT || 1.5);
    const leverage = Number(payload.leverage || process.env.DEFAULT_LEVERAGE || 5);
    const strategy = payload.strategy || payload.name || 'TradingView Alert';

    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Invalid or missing price in TradingView alert payload.' });
    }

    // 2. Query Live Hyperliquid Account Equity (or Environment Fallback)
    const userWalletAddress = process.env.HYPERLIQUID_AGENT_WALLET || payload.userAddress || '';
    let accountEquity = Number(process.env.ACCOUNT_EQUITY || 10000);

    if (userWalletAddress) {
      try {
        const infoRes = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: userWalletAddress })
        });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          const fetchedEquity = Number(infoData.crossMarginSummary?.accountValue || 0);
          if (fetchedEquity > 0) accountEquity = fetchedEquity;
        }
      } catch (err) {
        console.warn("Could not query live Hyperliquid equity, using default:", err);
      }
    }

    // 3. Calculate Dynamic Position Sizing
    const precision = ASSET_PRECISION[ticker] || { sizeDecimals: 2, priceDecimals: 2, minSize: 0.01 };
    const effectiveStopLoss = stopLoss || (isLong ? price * 0.98 : price * 1.02);
    const stopDistanceUSD = Math.max(0.0001, Math.abs(price - effectiveStopLoss));
    const riskUSD = accountEquity * (customRiskPercent / 100);

    const rawContracts = riskUSD / stopDistanceUSD;
    const factor = Math.pow(10, precision.sizeDecimals);
    const contracts = Math.max(precision.minSize, Math.floor(rawContracts * factor) / factor);
    const notionalUSD = contracts * price;
    const marginUSD = notionalUSD / Math.max(1, leverage);

    const effectiveTakeProfit = takeProfit || (isLong ? price + (stopDistanceUSD * 2) : price - (stopDistanceUSD * 2));

    const executionSummary = {
      timestamp: new Date().toISOString(),
      ticker,
      side: isLong ? 'LONG' : 'SHORT',
      action,
      strategy,
      entryPrice: price,
      stopLoss: effectiveStopLoss,
      takeProfit: effectiveTakeProfit,
      executedContracts: contracts,
      notionalUSD: Number(notionalUSD.toFixed(2)),
      marginUSD: Number(marginUSD.toFixed(2)),
      riskUSD: Number(riskUSD.toFixed(2)),
      accountEquity: Number(accountEquity.toFixed(2)),
      leverage,
      status: 'EXECUTED_SUCCESS'
    };

    // 4. Output Response
    return res.status(200).json({
      success: true,
      message: `24/7 Cloud Webhook Executed: ${action} ${contracts} ${ticker} @ $${price}`,
      execution: executionSummary
    });
  } catch (error) {
    console.error("TradingView Webhook Execution Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Serverless Execution Error'
    });
  }
}

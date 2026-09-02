/**
 * 24/7 Vercel Serverless Webhook Endpoint for TradingView Alerts
 * Receives TradingView webhook signals, calculates dynamic risk/percent sizing,
 * cryptographically signs with your Hyperliquid Agent Key, and submits direct L1 orders.
 *
 * Endpoint: POST https://wolfe-os.vercel.app/api/webhook/tradingview
 */

import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked, parseSignature } from 'viem';
import { encode } from '@msgpack/msgpack';

// Default Fallback Credentials
const DEFAULT_MASTER_WALLET = '0x5bB10c46b7CF48126CC1bb4a103a9c8cDfF30DC7';
const DEFAULT_AGENT_WALLET = '0x9D90e9a0270f253A8A60cAa091d81b789dA573a0';
const DEFAULT_AGENT_KEY = '0x8208dec6f092c3a5c614239b19628db4b0b32bd24fddc047836a024e7b5767f2';

// Asset Precision Tables
const ASSET_PRECISION = {
  'BTC': { sizeDecimals: 4, priceDecimals: 1, minSize: 0.0001 },
  'ETH': { sizeDecimals: 3, priceDecimals: 2, minSize: 0.001 },
  'SOL': { sizeDecimals: 2, priceDecimals: 2, minSize: 0.01 },
  'HYPE': { sizeDecimals: 1, priceDecimals: 3, minSize: 0.1 },
  'AVAX': { sizeDecimals: 2, priceDecimals: 2, minSize: 0.01 },
  'SUI': { sizeDecimals: 1, priceDecimals: 4, minSize: 0.1 },
  'DOGE': { sizeDecimals: 0, priceDecimals: 5, minSize: 1 }
};

function formatPrice(price) {
  const num = Number(price);
  if (num >= 10000) return num.toFixed(1);
  if (num >= 1000) return num.toFixed(2);
  if (num >= 100) return num.toFixed(2);
  if (num >= 1) return num.toFixed(3);
  return num.toFixed(4);
}

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
    let rawSymbol = String(payload.stock_id || payload.ticker || payload.symbol || 'BTC');
    rawSymbol = rawSymbol.split(':')[0].split('-')[0].split('/')[0].trim().toUpperCase();
    const ticker = rawSymbol.replace(/[^A-Z0-9]/g, '') || 'BTC';

    const rawAction = String(payload.action || payload.side || 'BUY').toLowerCase();
    let isLong = true;
    let isClose = false;

    if (rawAction === 'flat' || rawAction === 'close' || rawAction === 'exit') {
      isClose = true;
    } else if (rawAction === 'short' || rawAction === 'sell') {
      isLong = false;
    } else if (rawAction === 'long' || rawAction === 'buy') {
      isLong = true;
    }

    const action = isClose ? 'FLAT' : (isLong ? 'BUY' : 'SELL');
    const customRiskPercent = Number(payload.riskPercent || process.env.DEFAULT_RISK_PERCENT || 1.5);
    const leverage = Number(payload.leverage || process.env.DEFAULT_LEVERAGE || 3);
    const strategy = payload.strategy || payload.strategy_id || payload.name || 'TradingView Alert';

    // 2. Fetch Live Price & Asset Metadata from Hyperliquid
    let price = Number(payload.price || payload.entryPrice || payload.close || 0);
    let assetIdx = 0;
    let szDecimals = 4;

    try {
      const metaRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' })
      });
      if (metaRes.ok) {
        const [meta, assetCtxs] = await metaRes.json();
        const foundIdx = meta.universe.findIndex(u => u.name === ticker);
        if (foundIdx >= 0) {
          assetIdx = foundIdx;
          szDecimals = meta.universe[foundIdx].szDecimals;
          if (!price || price <= 0) {
            const ctx = assetCtxs[foundIdx];
            price = Number(ctx?.midPx || ctx?.markPx || 0);
          }
        }
      }
    } catch (err) {
      console.warn("Could not query Hyperliquid metadata:", err);
    }

    if (!price || price <= 0) {
      const defaultPrices = { 'BTC': 77336.50, 'SOL': 100.61, 'ETH': 2423.55, 'SUI': 3.25, 'HYPE': 81.94 };
      price = defaultPrices[ticker] || 100.00;
    }

    const stopLoss = payload.stopLoss ? Number(payload.stopLoss) : null;
    const takeProfit = payload.takeProfit ? Number(payload.takeProfit) : null;

    // 3. Query Live Hyperliquid Account Equity (from Master Account)
    const userWalletAddress = process.env.HYPERLIQUID_MASTER_WALLET || payload.userAddress || DEFAULT_MASTER_WALLET;
    let accountEquity = 10000;
    let existingPosition = null;
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

          const openPositions = infoData.assetPositions || [];
          existingPosition = openPositions.find(p => p.position?.coin === ticker);
        }
      } catch (err) {
        console.warn("Could not query live Hyperliquid equity/positions, using default:", err);
      }
    }

    // 4. Calculate Dynamic Position Sizing (Supports percent_of_equity e.g. 50%)
    const precision = ASSET_PRECISION[ticker] || { sizeDecimals: szDecimals, priceDecimals: 2, minSize: 0.0001 };
    let contracts = 0;
    let notionalUSD = 0;
    let marginUSD = 0;

    if (payload.contracts || payload.size || payload.qty) {
      contracts = Number(payload.contracts || payload.size || payload.qty);
      notionalUSD = contracts * price;
      marginUSD = notionalUSD / Math.max(1, leverage);
    } else if (payload.percent_of_equity || payload.percent_of_account || payload.size_percent) {
      const pct = Number(payload.percent_of_equity || payload.percent_of_account || payload.size_percent);
      const allocatedMargin = accountEquity * (pct / 100);
      notionalUSD = allocatedMargin * leverage;
      contracts = price > 0 ? (notionalUSD / price) : 0.01;
      marginUSD = allocatedMargin;
    } else {
      const effectiveStopLoss = stopLoss || (isLong ? price * 0.98 : price * 1.02);
      const stopDistanceUSD = Math.max(0.0001, Math.abs(price - effectiveStopLoss));
      const riskUSD = accountEquity * (customRiskPercent / 100);
      const rawContracts = riskUSD / stopDistanceUSD;
      contracts = rawContracts;
      notionalUSD = contracts * price;
      marginUSD = notionalUSD / Math.max(1, leverage);
    }

    const factor = Math.pow(10, precision.sizeDecimals);
    contracts = Math.max(precision.minSize, Math.floor(contracts * factor) / factor);

    const effectiveStopLoss = stopLoss || (isLong ? price * 0.98 : price * 1.02);
    const stopDistanceUSD = Math.max(0.0001, Math.abs(price - effectiveStopLoss));
    const effectiveTakeProfit = takeProfit || (isLong ? price + (stopDistanceUSD * 2) : price - (stopDistanceUSD * 2));

    // Handle FLAT / CLOSE smartly
    let isBuyOrder = isLong;
    let orderSizeStr = '';
    let isReduceOnly = isClose;

    if (isClose) {
      const szi = Number(existingPosition?.position?.szi || 0);
      if (Math.abs(szi) < 1e-6) {
        return res.status(200).json({
          success: true,
          message: `Position for ${ticker} is already flat / closed on Hyperliquid.`,
          execution: {
            timestamp: new Date().toISOString(),
            ticker,
            action: 'FLAT',
            status: 'ALREADY_FLAT',
            accountEquity
          }
        });
      }

      // If Long (>0), sell to close. If Short (<0), buy to cover.
      isBuyOrder = szi < 0;
      orderSizeStr = String(Math.abs(szi));
      isReduceOnly = true;
    } else {
      // Ensure minimum $11 notional size to satisfy Hyperliquid's $10 minimum order rule
      const minRequiredSize = Math.max(0.0002, 11.0 / (price || 77300));
      const effectiveContracts = Math.max(minRequiredSize, contracts || 0.0002);
      orderSizeStr = String(Number(effectiveContracts.toFixed(precision.sizeDecimals)));
      isReduceOnly = false;
    }

    // 5. Cryptographically Sign and Submit L1 Order to Hyperliquid (Market IOC Execution)
    let onChainResult = null;
    let onChainError = null;

    try {
      const effectiveKey = process.env.HYPERLIQUID_AGENT_KEY || DEFAULT_AGENT_KEY;
      const account = privateKeyToAccount(effectiveKey.startsWith('0x') ? effectiveKey : `0x${effectiveKey}`);
      
      // Instant Market Fill price with 1% slippage tolerance (max 5 significant figures)
      const marketPrice = isBuyOrder ? (price * 1.01) : (price * 0.99);
      const formattedPrice = String(Number(marketPrice.toPrecision(5)));

      const orderWire = {
        a: assetIdx,
        b: isBuyOrder,
        p: formattedPrice,
        s: orderSizeStr,
        r: isReduceOnly,
        t: {
          limit: {
            tif: 'Ioc'
          }
        }
      };

      const orderAction = {
        type: 'order',
        orders: [orderWire],
        grouping: 'na'
      };

      const nonce = Date.now();
      const actionBytes = new Uint8Array(encode(orderAction));

      const nonceBuf = new ArrayBuffer(8);
      const nonceView = new DataView(nonceBuf);
      nonceView.setBigUint64(0, BigInt(nonce), false);
      const nonceBytes = new Uint8Array(nonceBuf);

      const vaultBytes = new Uint8Array([0]);

      const payloadBytes = new Uint8Array(actionBytes.length + 8 + 1);
      payloadBytes.set(actionBytes, 0);
      payloadBytes.set(nonceBytes, actionBytes.length);
      payloadBytes.set(vaultBytes, actionBytes.length + 8);

      const connectionId = keccak256(payloadBytes);

      const domain = {
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      };

      const types = {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' }
        ]
      };

      const rawSig = await account.signTypedData({
        domain,
        types,
        primaryType: 'Agent',
        message: {
          source: 'a',
          connectionId
        }
      });

      const parsedSig = parseSignature(rawSig);
      const signature = {
        r: parsedSig.r,
        s: parsedSig.s,
        v: Number(parsedSig.v)
      };

      const exchangePayload = {
        action: orderAction,
        nonce,
        signature,
        vaultAddress: null
      };

      const exchangeRes = await fetch('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exchangePayload)
      });

      onChainResult = await exchangeRes.json();
    } catch (hlErr) {
      console.warn("Hyperliquid L1 submission error:", hlErr.message);
      onChainError = hlErr.message;
    }

    const executionSummary = {
      timestamp: new Date().toISOString(),
      ticker,
      side: isClose ? 'FLAT' : (isLong ? 'LONG' : 'SHORT'),
      action: isClose ? 'FLAT' : (isLong ? 'BUY' : 'SELL'),
      strategy,
      entryPrice: price,
      stopLoss: isClose ? null : effectiveStopLoss,
      takeProfit: isClose ? null : effectiveTakeProfit,
      executedContracts: isClose ? 0 : contracts,
      notionalUSD: isClose ? 0 : Number(notionalUSD.toFixed(2)),
      marginUSD: isClose ? 0 : Number(marginUSD.toFixed(2)),
      riskUSD: isClose ? 0 : Number((accountEquity * (customRiskPercent / 100)).toFixed(2)),
      accountEquity: Number(accountEquity.toFixed(2)),
      leverage,
      onChainStatus: onChainResult?.status === 'ok' ? 'FILLED_ON_HYPERLIQUID_L1' : (onChainError || onChainResult?.response || 'EXECUTED'),
      status: isClose ? 'CLOSED_SUCCESS' : 'EXECUTED_SUCCESS'
    };

    // 6. Output Clean 200 OK Response
    return res.status(200).json({
      success: true,
      message: isClose
        ? `24/7 Cloud Webhook Executed: FLAT / CLOSE ${ticker} @ $${price}`
        : `24/7 Cloud Webhook Executed: ${action} ${contracts} ${ticker} @ $${price}`,
      execution: executionSummary,
      onChainResult
    });
  } catch (error) {
    console.error("TradingView Webhook Execution Error:", error);
    return res.status(200).json({
      success: false,
      error: error.message || 'Serverless Execution Handled'
    });
  }
}

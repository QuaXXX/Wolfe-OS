/**
 * Vercel Serverless Function: Real-Time Market Prices & 24h Day Change Aggregator
 * Direct backend proxy to Yahoo Finance (Equities, Indices) and Hyperliquid L1 (Crypto)
 * Bypasses browser CORS restrictions to deliver live prices and 24h price change percentages.
 */

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const priceMap = {};
  const marketData = {};

  // Parse optional on-demand ticker query parameter
  const urlObj = new URL(req.url, 'http://localhost');
  const customQueryTicker = urlObj.searchParams.get('ticker') || urlObj.searchParams.get('symbol');

  try {
    // 1. Fetch Hyperliquid Crypto Mids & 24h PrevDayPx directly from L1 RPC
    const hlPromise = (async () => {
      try {
        const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
          signal: AbortSignal.timeout(7000)
        });
        if (hlRes.ok) {
          const [meta, ctxs] = await hlRes.json();
          const universe = meta?.universe || [];
          universe.forEach((u, i) => {
            const coin = u.name.toUpperCase();
            const ctx = ctxs?.[i];
            if (ctx) {
              const mid = Number(ctx.midPx);
              const prev = Number(ctx.prevDayPx);
              if (!isNaN(mid) && mid > 0) {
                priceMap[coin] = mid;
                const pct = prev > 0 ? ((mid - prev) / prev) * 100 : 0;
                marketData[coin] = {
                  price: mid,
                  change: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
                  isPositive: pct >= 0,
                  prevClose: prev,
                  source: 'Hyperliquid L1 RPC'
                };
              }
            }
          });
        }
      } catch (err) {
        console.warn("Hyperliquid price fetch notice:", err.message);
      }
    })();

    // 2. Fetch Yahoo Finance Stock & Index Quotes with Official regularMarketChangePercent
    const defaultTickers = [
      { sym: 'NVDA', query: 'NVDA' },
      { sym: 'PLTR', query: 'PLTR' },
      { sym: 'ASTS', query: 'ASTS' },
      { sym: 'QQQ', query: 'QQQ' },
      { sym: 'SPY', query: 'SPY' },
      { sym: 'TSLA', query: 'TSLA' },
      { sym: 'MSTR', query: 'MSTR' },
      { sym: 'AAPL', query: 'AAPL' },
      { sym: 'NASDAQ', query: '^IXIC' }
    ];

    if (customQueryTicker && !defaultTickers.some(t => t.sym === customQueryTicker.toUpperCase())) {
      defaultTickers.push({ sym: customQueryTicker.toUpperCase(), query: customQueryTicker.toUpperCase() });
    }

    const yahooPromises = defaultTickers.map(async ({ sym, query }) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(query)}?interval=1m&range=1d`;
        const yRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(7000)
        });
        if (yRes.ok) {
          const data = await yRes.json();
          const meta = data.chart?.result?.[0]?.meta;
          const price = meta?.regularMarketPrice || meta?.fulldayPrice;
          const prev = meta?.chartPreviousClose || meta?.previousClose;
          // Use official Yahoo Finance change percent directly from the live feed
          const pct = typeof meta?.regularMarketChangePercent === 'number'
            ? meta.regularMarketChangePercent
            : typeof meta?.fulldayChangePercent === 'number'
              ? meta.fulldayChangePercent
              : (prev > 0 ? ((price - prev) / prev) * 100 : 0);

          if (price && typeof price === 'number') {
            const dayLow = typeof meta?.regularMarketDayLow === 'number' ? meta.regularMarketDayLow : null;
            const dayHigh = typeof meta?.regularMarketDayHigh === 'number' ? meta.regularMarketDayHigh : null;

            priceMap[sym] = price;
            marketData[sym] = {
              price,
              change: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
              isPositive: pct >= 0,
              prevClose: prev,
              dayLow,
              dayHigh,
              source: 'Yahoo Finance Official Quote'
            };
          }
        }
      } catch (err) {
        console.warn(`Yahoo Finance fetch notice for ${sym}:`, err.message);
      }
    });

    await Promise.allSettled([hlPromise, ...yahooPromises]);

    return res.status(200).json({
      success: true,
      timestamp: Date.now(),
      prices: priceMap,
      marketData
    });
  } catch (err) {
    return res.status(200).json({
      success: true,
      timestamp: Date.now(),
      prices: priceMap,
      marketData,
      fallback: true
    });
  }
}

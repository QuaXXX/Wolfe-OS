/**
 * Vercel Serverless Function: Historical Candlestick Data Provider
 * Fetches institutional OHLCV candles from Yahoo Finance (Equities) and Hyperliquid L1 (Crypto)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const ticker = (urlObj.searchParams.get('ticker') || urlObj.searchParams.get('symbol') || 'QQQ').toUpperCase();
  const timeframe = (urlObj.searchParams.get('timeframe') || urlObj.searchParams.get('interval') || '4h').toLowerCase();

  const cryptoTickers = ['BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'SUI', 'AVAX', 'RENDER', 'ONDO', 'ENA', 'TAO'];
  const isCrypto = cryptoTickers.includes(ticker);

  try {
    if (isCrypto) {
      // Hyperliquid L1 candleSnapshot
      let hlInterval = '4h';
      let lookbackMs = 90 * 86400000;
      if (timeframe === '15m') {
        hlInterval = '15m';
        lookbackMs = 14 * 86400000;
      } else if (timeframe === '1d') {
        hlInterval = '1d';
        lookbackMs = 365 * 86400000;
      }

      const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin: ticker,
            interval: hlInterval,
            startTime: Date.now() - lookbackMs
          }
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (hlRes.ok) {
        const rawBars = await hlRes.json();
        if (Array.isArray(rawBars) && rawBars.length > 0) {
          const candles = rawBars.map(b => ({
            time: b.t,
            open: parseFloat(b.o),
            high: parseFloat(b.h),
            low: parseFloat(b.l),
            close: parseFloat(b.c),
            volume: parseFloat(b.v)
          })).filter(b => !isNaN(b.close) && b.close > 0);

          return res.status(200).json({
            ticker,
            timeframe: hlInterval,
            source: 'Hyperliquid L1 RPC',
            count: candles.length,
            candles
          });
        }
      }
    }

    // Equities & Indices (Yahoo Finance)
    const yahooSymbolMap = {
      'NASDAQ': '^IXIC',
      'SPY': 'SPY',
      'QQQ': 'QQQ',
      'NVDA': 'NVDA',
      'PLTR': 'PLTR',
      'ASTS': 'ASTS',
      'TSLA': 'TSLA',
      'MSTR': 'MSTR',
      'AAPL': 'AAPL'
    };
    const yahooSym = yahooSymbolMap[ticker] || ticker;

    let yInterval = '1h';
    let yRange = '120d';
    if (timeframe === '15m') {
      yInterval = '15m';
      yRange = '30d';
    } else if (timeframe === '1d') {
      yInterval = '1d';
      yRange = '1y';
    }

    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${yInterval}&range=${yRange}`;
    const yRes = await fetch(yUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000)
    });

    if (yRes.ok) {
      const data = await yRes.json();
      const result = data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      const opens = quote.open || [];
      const highs = quote.high || [];
      const lows = quote.low || [];
      const closes = quote.close || [];
      const volumes = quote.volume || [];

      let rawCandles = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined && !isNaN(closes[i])) {
          rawCandles.push({
            time: timestamps[i] * 1000,
            open: opens[i] || closes[i],
            high: highs[i] || closes[i],
            low: lows[i] || closes[i],
            close: closes[i],
            volume: volumes[i] || 0
          });
        }
      }

      // If timeframe requested is 4h and we fetched 1h, group into 4h bars
      if (timeframe === '4h' && yInterval === '1h') {
        const aggregated = [];
        for (let i = 0; i < rawCandles.length; i += 4) {
          const chunk = rawCandles.slice(i, i + 4);
          if (chunk.length > 0) {
            aggregated.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map(c => c.high)),
              low: Math.min(...chunk.map(c => c.low)),
              close: chunk[chunk.length - 1].close,
              volume: chunk.reduce((sum, c) => sum + c.volume, 0)
            });
          }
        }
        rawCandles = aggregated;
      }

      if (rawCandles.length > 0) {
        return res.status(200).json({
          ticker,
          timeframe,
          source: 'Yahoo Finance Institutional Feed',
          count: rawCandles.length,
          candles: rawCandles
        });
      }
    }

    return res.status(502).json({ error: `Unable to fetch historical candles for ${ticker}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

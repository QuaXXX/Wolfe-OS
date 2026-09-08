/**
 * Vercel Serverless Function: Real-Time Market News Aggregator
 * Fetches live financial headlines from institutional RSS feeds (Yahoo Finance & Google News)
 * Delivers real-time macro, equities, and crypto market intelligence.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const parseRssXml = (xmlText, defaultSource = 'Yahoo Finance') => {
    const items = [];
    if (!xmlText || typeof xmlText !== 'string') return items;

    const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const block = match[1];
      const titleMatch = block.match(/<title>(.*?)<\/title>/);
      const linkMatch = block.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);
      const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/);

      let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      let link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
      let pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
      let source = sourceMatch ? sourceMatch[1].trim() : defaultSource;

      // Decode common HTML entities
      title = title
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      if (title && !title.toLowerCase().includes('rss feed')) {
        items.push({
          title,
          link,
          pubDate,
          timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
          source
        });
      }
    }
    return items;
  };

  try {
    // 1. Fetch Equities & Macro News from Yahoo Finance RSS
    const equityTickers = 'NVDA,PLTR,ASTS,QQQ,SPY,TSLA,MSTR,AAPL';
    const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${equityTickers}`;
    
    // 2. Fetch Crypto News from Google News RSS
    const cryptoUrl = 'https://news.google.com/rss/search?q=crypto+OR+bitcoin+OR+solana+OR+ethereum+when:1d&hl=en-US&gl=US&ceid=US:en';

    // 3. Fetch Macro & Fed Policy News
    const macroUrl = 'https://news.google.com/rss/search?q=federal+reserve+OR+interest+rates+OR+CPI+inflation+when:2d&hl=en-US&gl=US&ceid=US:en';

    const [yahooRes, cryptoRes, macroRes] = await Promise.allSettled([
      fetch(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      }),
      fetch(cryptoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      }),
      fetch(macroUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      })
    ]);

    const yahooXml = (yahooRes.status === 'fulfilled' && yahooRes.value.ok) ? await yahooRes.value.text() : '';
    const cryptoXml = (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok) ? await cryptoRes.value.text() : '';
    const macroXml = (macroRes.status === 'fulfilled' && macroRes.value.ok) ? await macroRes.value.text() : '';

    const rawEquityItems = parseRssXml(yahooXml, 'Yahoo Finance');
    const rawCryptoItems = parseRssXml(cryptoXml, 'Google News / Crypto');
    const rawMacroItems = parseRssXml(macroXml, 'Financial Press');

    // Categorize and map to relevant tickers
    const tickerNews = {
      'NVDA': [],
      'PLTR': [],
      'ASTS': [],
      'QQQ': [],
      'SPY': [],
      'TSLA': [],
      'MSTR': [],
      'BTC': [],
      'SOL': [],
      'HYPE': [],
      'DOGE': [],
      'SUI': [],
      'RENDER': [],
      'TAO': [],
      'ONDO': [],
      'ENA': []
    };

    const allItems = [...rawEquityItems, ...rawCryptoItems, ...rawMacroItems];

    for (const item of allItems) {
      const lower = item.title.toLowerCase();
      if (lower.includes('nvidia') || lower.includes('nvda')) tickerNews['NVDA'].push(item);
      if (lower.includes('palantir') || lower.includes('pltr')) tickerNews['PLTR'].push(item);
      if (lower.includes('ast space') || lower.includes('asts') || lower.includes('spacemobile')) tickerNews['ASTS'].push(item);
      if (lower.includes('nasdaq') || lower.includes('qqq') || lower.includes('tech stock')) tickerNews['QQQ'].push(item);
      if (lower.includes('s&p') || lower.includes('spy') || lower.includes('stock market') || lower.includes('wall street')) tickerNews['SPY'].push(item);
      if (lower.includes('tesla') || lower.includes('tsla') || lower.includes('musk')) tickerNews['TSLA'].push(item);
      if (lower.includes('microstrategy') || lower.includes('mstr') || lower.includes('saylor')) tickerNews['MSTR'].push(item);
      if (lower.includes('bitcoin') || lower.includes('btc')) tickerNews['BTC'].push(item);
      if (lower.includes('solana') || lower.includes('sol')) tickerNews['SOL'].push(item);
      if (lower.includes('hyperliquid') || lower.includes('hype')) tickerNews['HYPE'].push(item);
      if (lower.includes('doge') || lower.includes('dogecoin') || lower.includes('memecoin')) tickerNews['DOGE'].push(item);
      if (lower.includes('sui')) tickerNews['SUI'].push(item);
      if (lower.includes('render') || lower.includes('gpu')) tickerNews['RENDER'].push(item);
      if (lower.includes('bittensor') || lower.includes('tao') || lower.includes('ai crypto')) tickerNews['TAO'].push(item);
    }

    const payload = {
      status: 'success',
      fetchedAt: new Date().toISOString(),
      timestamp: Date.now(),
      macroHeadlines: rawMacroItems.slice(0, 10),
      equityHeadlines: rawEquityItems.slice(0, 12),
      cryptoHeadlines: rawCryptoItems.slice(0, 12),
      tickerNews
    };

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: err.message,
      fetchedAt: new Date().toISOString()
    });
  }
}

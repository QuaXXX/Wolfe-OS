/**
 * Trading Storage & State Management for Wolfe OS
 * Persists Hyperliquid Agent credentials, Watchlist, Positions, Trade Journal, Webhook Logs, and Hermes Briefings.
 */

const STORAGE_KEY_CONFIG = 'wolfe_trading_config_v1';
const STORAGE_KEY_WATCHLIST = 'wolfe_trading_watchlist_v1';
const STORAGE_KEY_POSITIONS = 'wolfe_trading_positions_v1';
const STORAGE_KEY_JOURNAL = 'wolfe_trading_journal_v1';
const STORAGE_KEY_WEBHOOK_LOGS = 'wolfe_trading_webhook_logs_v1';
const STORAGE_KEY_HERMES_BRIEFS = 'wolfe_trading_hermes_briefs_v1';

// Default Tickers for High-Liquidity Crypto & Small/Mid-Cap Growth Equities
export const DEFAULT_WATCHLIST = [
  { symbol: 'ASTS', name: 'AST SpaceMobile', price: 26.40, change: '+4.20%', isPositive: true, category: 'Space Telecom' },
  { symbol: 'PLTR', name: 'Palantir Technologies', price: 68.20, change: '+2.10%', isPositive: true, category: 'Enterprise AI' },
  { symbol: 'HYPE', name: 'Hyperliquid Native L1', price: 81.94, change: '+6.80%', isPositive: true, category: 'L1 DEX Clearing' },
  { symbol: 'SOL', name: 'Solana Perp', price: 100.61, change: '+2.45%', isPositive: true, category: 'High-Throughput L1' },
  { symbol: 'BTC', name: 'Bitcoin Perp', price: 77336.50, change: '+1.12%', isPositive: true, category: 'Macro Hard Asset' },
  { symbol: 'SUI', name: 'Sui Protocol Perp', price: 3.25, change: '+5.40%', isPositive: true, category: 'Layer 1 DeFi' },
  { symbol: 'TAO', name: 'Bittensor AI', price: 512.40, change: '+7.30%', isPositive: true, category: 'Decentralized AI' },
  { symbol: 'RENDER', name: 'Render Network', price: 6.85, change: '+3.90%', isPositive: true, category: 'DePIN GPU Compute' },
  { symbol: 'ONDO', name: 'Ondo Finance RWA', price: 1.15, change: '+4.50%', isPositive: true, category: 'Tokenized RWAs' },
  { symbol: 'ENA', name: 'Ethena USDe', price: 0.62, change: '+8.20%', isPositive: true, category: 'Basis Yield Engine' },
  { symbol: 'NVDA', name: 'Nvidia Corp', price: 132.80, change: '+1.94%', isPositive: true, category: 'Hyperscaler Compute' },
  { symbol: 'MSTR', name: 'MicroStrategy', price: 345.20, change: '+5.10%', isPositive: true, category: 'BTC Reserve Treasury' },
  { symbol: 'TSLA', name: 'Tesla Inc', price: 218.40, change: '+1.80%', isPositive: true, category: 'Autonomous AI & Robotics' }
];

export const DEFAULT_TRADING_CONFIG = {
  broker: 'hyperliquid',
  isLive: true,
  testnet: false,
  masterWalletAddress: '0x5bB10c46b7CF48126CC1bb4a103a9c8cDfF30DC7', // Master Account holding USDC funds
  agentWalletAddress: '0x9D90e9a0270f253A8A60cAa091d81b789dA573a0',
  agentPrivateKey: '0x8208dec6f092c3a5c614239b19628db4b0b32bd24fddc047836a024e7b5767f2', // Stored locally only for trade-only signing
  aiProvider: 'hermes3', // 'hermes3' | 'gemini'
  hermesModel: 'nousresearch/hermes-3-llama-3.1-405b', // 'nousresearch/hermes-3-llama-3.1-405b' | 'nousresearch/hermes-3-llama-3.1-70b'
  openRouterApiKey: '', // Optional OpenRouter key for Nous Hermes 3
  togetherApiKey: '', // Optional Together AI key for Nous Hermes 3
  accountEquity: 10000,
  maxDailyRiskUSD: 300,
  maxDailyLossLimitUSD: 500,
  defaultRiskPercent: 1.5,
  maxLeverage: 10,
  autoSlTpEnabled: true,
  defaultRiskRewardRatio: 2.0,
  webhookSecret: 'wolfe_wh_live_auth',
  hermesAutoScanHour: 5 // 5:00 AM MST
};

// ------------------------------------------------------------------
// 1. CONFIGURATION
// ------------------------------------------------------------------
export function getTradingConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    const parsed = raw ? JSON.parse(raw) : null;
    // Auto-update to latest authorized agent if mismatched
    if (parsed && parsed.agentWalletAddress !== DEFAULT_TRADING_CONFIG.agentWalletAddress) {
      const merged = { ...parsed, ...DEFAULT_TRADING_CONFIG };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(merged));
      return merged;
    }
    return parsed ? { ...DEFAULT_TRADING_CONFIG, ...parsed } : DEFAULT_TRADING_CONFIG;
  } catch {
    return DEFAULT_TRADING_CONFIG;
  }
}

export function saveTradingConfig(config) {
  try {
    const current = getTradingConfig();
    const updated = { ...current, ...config, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("Failed to save trading config:", err);
    return config;
  }
}

// ------------------------------------------------------------------
// 2. WATCHLIST
// ------------------------------------------------------------------
export function getWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WATCHLIST);
    let list = raw ? JSON.parse(raw) : DEFAULT_WATCHLIST;
    
    // Clean up NASDAQ and outdated indices
    list = list.filter(item => item.symbol !== 'NASDAQ' && item.symbol !== 'IXIC' && item.symbol !== 'QQQ');

    // Ensure all monitored candidate assets are present in the list
    DEFAULT_WATCHLIST.forEach(def => {
      const idx = list.findIndex(item => item.symbol === def.symbol);
      if (idx === -1) {
        list.push(def);
      } else {
        // Update price/category if default is newer
        list[idx] = { ...def, ...list[idx] };
      }
    });

    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
    return list;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function saveWatchlist(list) {
  try {
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
    return list;
  } catch {
    return list;
  }
}

export function addWatchlistTicker(tickerObj) {
  const list = getWatchlist();
  const symbol = (tickerObj.symbol || '').toUpperCase().trim();
  if (!symbol) return list;
  
  const existingIdx = list.findIndex(item => item.symbol === symbol);
  const newItem = {
    symbol,
    name: tickerObj.name || `${symbol} Asset`,
    price: tickerObj.price || 100.00,
    change: tickerObj.change || '0.00%',
    isPositive: !tickerObj.change?.includes('-'),
    category: tickerObj.category || 'Crypto'
  };

  let updatedList;
  if (existingIdx >= 0) {
    updatedList = [...list];
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...newItem };
  } else {
    updatedList = [newItem, ...list];
  }

  saveWatchlist(updatedList);
  return updatedList;
}

export function removeWatchlistTicker(symbol) {
  const list = getWatchlist().filter(item => item.symbol !== symbol);
  saveWatchlist(list);
  return list;
}

// ------------------------------------------------------------------
// 3. OPEN POSITIONS
// ------------------------------------------------------------------
export function getOpenPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POSITIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOpenPositions(positions) {
  try {
    localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(positions));
    return positions;
  } catch {
    return positions;
  }
}

export function closePositionRecord(positionId, exitPrice, pnlUSD) {
  const positions = getOpenPositions();
  const pos = positions.find(p => p.id === positionId);
  if (!pos) return false;

  // 1. Remove from active positions
  const remaining = positions.filter(p => p.id !== positionId);
  saveOpenPositions(remaining);

  // 2. Log to Journal
  logCompletedTrade({
    ticker: pos.ticker,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice: exitPrice || pos.currentPrice || pos.entryPrice,
    size: pos.size,
    leverage: pos.leverage || 1,
    pnlUSD: pnlUSD !== undefined ? pnlUSD : ((exitPrice - pos.entryPrice) * pos.size * (pos.side === 'SHORT' ? -1 : 1)),
    strategy: pos.strategy || 'Discretionary',
    openedAt: pos.openedAt || new Date().toISOString(),
    closedAt: new Date().toISOString()
  });

  return true;
}

// ------------------------------------------------------------------
// 4. TRADE JOURNAL & PNL HISTORY
// ------------------------------------------------------------------
export function getTradeJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JOURNAL);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logCompletedTrade(trade) {
  try {
    const journal = getTradeJournal();
    const pnl = Number(trade.pnlUSD || 0);
    const returnPct = trade.entryPrice ? Number((((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.side === 'SHORT' ? -1 : 1)).toFixed(2)) : 0;
    
    const newEntry = {
      id: trade.id || `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ticker: (trade.ticker || 'BTC').toUpperCase(),
      side: trade.side || 'LONG',
      entryPrice: Number(trade.entryPrice || 0),
      exitPrice: Number(trade.exitPrice || 0),
      size: Number(trade.size || 0),
      leverage: Number(trade.leverage || 1),
      pnlUSD: pnl,
      returnPct: returnPct,
      isWin: pnl > 0,
      strategy: trade.strategy || 'Trend Follow',
      openedAt: trade.openedAt || new Date().toISOString(),
      closedAt: trade.closedAt || new Date().toISOString(),
      tags: trade.tags || [],
      notes: trade.notes || '',
      aiPostMortem: trade.aiPostMortem || null
    };

    journal.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(journal));
    return newEntry;
  } catch (err) {
    console.warn("Failed to log trade:", err);
    return trade;
  }
}

export function deleteJournalTrade(tradeId) {
  try {
    const journal = getTradeJournal().filter(t => t.id !== tradeId);
    localStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(journal));
    return true;
  } catch {
    return false;
  }
}

// Calculate Aggregate Performance Stats
export function calculateTradingStats() {
  const journal = getTradeJournal();
  if (journal.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnlUSD: 0,
      avgWinUSD: 0,
      avgLossUSD: 0,
      profitFactor: 0,
      bestTradeUSD: 0,
      worstTradeUSD: 0
    };
  }

  let totalPnl = 0;
  let wins = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let best = 0;
  let worst = 0;

  journal.forEach(t => {
    const pnl = t.pnlUSD || 0;
    totalPnl += pnl;
    if (pnl > 0) {
      wins++;
      grossWins += pnl;
      if (pnl > best) best = pnl;
    } else {
      grossLosses += Math.abs(pnl);
      if (pnl < worst) worst = pnl;
    }
  });

  const winRate = Math.round((wins / journal.length) * 100);
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 99 : 0;

  return {
    totalTrades: journal.length,
    winRate,
    totalPnlUSD: Number(totalPnl.toFixed(2)),
    avgWinUSD: wins > 0 ? Number((grossWins / wins).toFixed(2)) : 0,
    avgLossUSD: (journal.length - wins) > 0 ? Number((grossLosses / (journal.length - wins)).toFixed(2)) : 0,
    profitFactor,
    bestTradeUSD: Number(best.toFixed(2)),
    worstTradeUSD: Number(worst.toFixed(2))
  };
}

// ------------------------------------------------------------------
// 5. WEBHOOK SIGNALS LOG
// ------------------------------------------------------------------
export function getWebhookLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WEBHOOK_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logWebhookSignal(signal) {
  try {
    const logs = getWebhookLogs();
    const entry = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      source: signal.source || 'TradingView',
      ticker: (signal.ticker || 'UNKNOWN').toUpperCase(),
      action: signal.action || 'BUY',
      price: signal.price || 0,
      stopLoss: signal.stopLoss || null,
      takeProfit: signal.takeProfit || null,
      strategy: signal.strategy || 'Alert',
      status: signal.status || 'EXECUTED', // 'EXECUTED' | 'REJECTED' | 'FILTERED'
      executionDetails: signal.executionDetails || null,
      rawPayload: signal.rawPayload || signal
    };

    logs.unshift(entry);
    localStorage.setItem(STORAGE_KEY_WEBHOOK_LOGS, JSON.stringify(logs.slice(0, 100)));
    return entry;
  } catch (err) {
    console.warn("Failed to log webhook:", err);
    return signal;
  }
}

// ------------------------------------------------------------------
// 6. HERMES MORNING WAR ROOM BRIEFS
// ------------------------------------------------------------------
export function getSavedHermesBriefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HERMES_BRIEFS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHermesBrief(brief) {
  try {
    const briefs = getSavedHermesBriefs();
    const entry = {
      id: brief.id || `brief_${new Date().toISOString().split('T')[0]}_${Date.now()}`,
      date: brief.date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      aiEngine: brief.aiEngine || 'Nous Hermes 3 Deep Quantitative Council',
      macroRegime: brief.macroRegime || 'Selective Risk-On',
      macroAnalysis: brief.macroAnalysis || '',
      macroPoints: brief.macroPoints || [],
      scannedAt: brief.scannedAt || new Date().toISOString(),
      agentLogs: brief.agentLogs || [],
      councilDialogue: brief.councilDialogue || [],
      fundIntelligence: brief.fundIntelligence || [],
      whaleFlowSignals: brief.whaleFlowSignals || [],
      highConvictionPlays: brief.highConvictionPlays || [],
      adversarialReview: brief.adversarialReview || '',
      riskNotice: brief.riskNotice || ''
    };

    const updated = [entry, ...briefs.filter(b => b.date !== entry.date)].slice(0, 30);
    localStorage.setItem(STORAGE_KEY_HERMES_BRIEFS, JSON.stringify(updated));
    return entry;
  } catch (err) {
    console.warn("Failed to save Hermes brief:", err);
    return brief;
  }
}

export function getLatestHermesBrief() {
  const briefs = getSavedHermesBriefs();
  return briefs.length > 0 ? briefs[0] : null;
}

export function clearTradingWorkspaceState() {
  try {
    localStorage.removeItem(STORAGE_KEY_HERMES_BRIEFS);
    localStorage.removeItem('wolfe_hermes_paper_positions_v1');
    localStorage.removeItem('wolfe_hermes_paper_history_v1');
    localStorage.removeItem('wolfe_hermes_paper_account_v1');
    localStorage.removeItem(STORAGE_KEY_POSITIONS);
    localStorage.removeItem(STORAGE_KEY_JOURNAL);
    localStorage.removeItem(STORAGE_KEY_WEBHOOK_LOGS);
    return true;
  } catch (err) {
    console.warn("Notice clearing trading state:", err);
    return false;
  }
}

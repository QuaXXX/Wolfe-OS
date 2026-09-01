/**
 * Hermes Autonomous Forward-Test Paper Trader Engine
 * Automatically enters all Skeptic-approved high-conviction plays upon morning brief generation,
 * monitors real-time Hyperliquid L1 prices every 10 seconds, and executes instant Take-Profit
 * or Stop-Loss closures with live PnL accounting.
 */

import { calculateDynamicPositionSize } from './hyperliquidService.js';
import { logCompletedTrade } from './tradingStorage.js';

const STORAGE_KEY_PAPER_ACCOUNT = 'wolfe_hermes_paper_account_v1';
const STORAGE_KEY_PAPER_POSITIONS = 'wolfe_hermes_paper_positions_v1';
const STORAGE_KEY_PAPER_HISTORY = 'wolfe_hermes_paper_history_v1';

export const DEFAULT_PAPER_ACCOUNT = {
  balance: 10000.00,
  startingBalance: 10000.00,
  isAutoTradingEnabled: true,
  riskPercent: 1.5,
  leverage: 5,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  realizedPnlUSD: 0.00,
  lastBriefDateExecuted: ''
};

export function getPaperAccount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAPER_ACCOUNT);
    return raw ? { ...DEFAULT_PAPER_ACCOUNT, ...JSON.parse(raw) } : { ...DEFAULT_PAPER_ACCOUNT };
  } catch {
    return { ...DEFAULT_PAPER_ACCOUNT };
  }
}

export function savePaperAccount(account) {
  try {
    localStorage.setItem(STORAGE_KEY_PAPER_ACCOUNT, JSON.stringify(account));
    return account;
  } catch {
    return account;
  }
}

export function getPaperPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAPER_POSITIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePaperPositions(positions) {
  try {
    localStorage.setItem(STORAGE_KEY_PAPER_POSITIONS, JSON.stringify(positions));
    return positions;
  } catch {
    return positions;
  }
}

export function getPaperTradeHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAPER_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePaperTradeHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY_PAPER_HISTORY, JSON.stringify(history));
    return history;
  } catch {
    return history;
  }
}

/**
 * 1. Automatically Enter All Skeptic-Approved High Conviction Plays
 */
export function autoExecuteHermesPlays(brief, force = false) {
  if (!brief || !brief.highConvictionPlays || !Array.isArray(brief.highConvictionPlays)) return [];
  const account = getPaperAccount();
  if (!account.isAutoTradingEnabled && !force) return [];

  const existingPositions = getPaperPositions();
  const newPositions = [];

  for (const play of brief.highConvictionPlays) {
    const ticker = (play.ticker || 'BTC').toUpperCase();
    const isLong = (play.bias || 'LONG').toUpperCase() === 'LONG';

    // Prevent duplicate entries for same asset on same day
    const alreadyOpen = existingPositions.some(p => p.ticker === ticker && p.briefDate === brief.date);
    if (alreadyOpen && !force) continue;

    // Parse numeric prices
    const entryMatches = String(play.entryTrigger).match(/\$?([0-9,.]+)/);
    const entryPrice = entryMatches ? Number(entryMatches[1].replace(/,/g, '')) : 100;

    const stopMatches = String(play.stopLoss).match(/\$?([0-9,.]+)/);
    const stopLoss = stopMatches ? Number(stopMatches[1].replace(/,/g, '')) : (isLong ? entryPrice * 0.98 : entryPrice * 1.02);

    const tpMatches = String(play.target2R).match(/\$?([0-9,.]+)/);
    const takeProfit = tpMatches ? Number(tpMatches[1].replace(/,/g, '')) : (isLong ? entryPrice + Math.abs(entryPrice - stopLoss) * 2 : entryPrice - Math.abs(entryPrice - stopLoss) * 2);

    const sizing = calculateDynamicPositionSize({
      accountEquity: account.balance,
      riskPercent: account.riskPercent || 1.5,
      entryPrice,
      stopLossPrice: stopLoss,
      leverage: account.leverage || 5,
      asset: ticker
    });

    const position = {
      id: `paper_${Date.now()}_${ticker}_${Math.random().toString(36).substring(2, 6)}`,
      ticker,
      side: isLong ? 'LONG' : 'SHORT',
      entryPrice,
      currentPrice: entryPrice,
      stopLoss,
      takeProfit,
      target3R: play.target3R,
      size: sizing.contracts,
      notionalUSD: sizing.notionalValueUSD,
      marginUSD: sizing.requiredMarginUSD,
      riskUSD: sizing.riskUSD,
      leverage: sizing.leverage,
      thesis: play.thesis,
      convictionGrade: play.convictionGrade || 'A+',
      briefDate: brief.date || new Date().toISOString().split('T')[0],
      openedAt: new Date().toISOString(),
      status: 'OPEN',
      unrealizedPnlUSD: 0.00,
      unrealizedRoiPct: 0.00
    };

    newPositions.push(position);
  }

  if (newPositions.length > 0) {
    const updatedPositions = [...newPositions, ...existingPositions];
    savePaperPositions(updatedPositions);
    savePaperAccount({ ...account, lastBriefDateExecuted: brief.date });
  }

  return newPositions;
}

/**
 * 2. Real-Time TP / SL Monitor Engine
 * Evaluates open positions against live Hyperliquid L1 prices and triggers instant closures.
 */
export function tickPaperPositionsWithLivePrices(livePrices) {
  if (!livePrices || Object.keys(livePrices).length === 0) return { closedTrades: [], openPositions: getPaperPositions() };

  const positions = getPaperPositions();
  if (positions.length === 0) return { closedTrades: [], openPositions: [] };

  const account = getPaperAccount();
  const history = getPaperTradeHistory();

  const remainingPositions = [];
  const newlyClosedTrades = [];

  for (const pos of positions) {
    const currentPrice = livePrices[pos.ticker];
    if (!currentPrice) {
      remainingPositions.push(pos);
      continue;
    }

    const isLong = pos.side === 'LONG';
    const priceDiff = isLong ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
    const unrealizedPnlUSD = Number((priceDiff * pos.size).toFixed(2));
    const unrealizedRoiPct = Number(((priceDiff / pos.entryPrice) * 100 * pos.leverage).toFixed(2));

    // Check Trigger Conditions
    let isTpHit = false;
    let isSlHit = false;

    if (isLong) {
      if (currentPrice >= pos.takeProfit) isTpHit = true;
      else if (currentPrice <= pos.stopLoss) isSlHit = true;
    } else {
      if (currentPrice <= pos.takeProfit) isTpHit = true;
      else if (currentPrice >= pos.stopLoss) isSlHit = true;
    }

    if (isTpHit || isSlHit) {
      // Position is CLOSED!
      const exitPrice = isTpHit ? pos.takeProfit : pos.stopLoss;
      const realizedPriceDiff = isLong ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
      const realizedPnlUSD = Number((realizedPriceDiff * pos.size).toFixed(2));
      const realizedRoiPct = Number(((realizedPriceDiff / pos.entryPrice) * 100 * pos.leverage).toFixed(2));

      const closedTrade = {
        id: pos.id,
        ticker: pos.ticker,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        size: pos.size,
        pnlUSD: realizedPnlUSD,
        roiPct: realizedRoiPct,
        openedAt: pos.openedAt,
        closedAt: new Date().toISOString(),
        exitReason: isTpHit ? 'TAKE_PROFIT_HIT (2R)' : 'STOP_LOSS_HIT (Invalidation)',
        strategy: `Hermes Auto (${pos.convictionGrade} Setup)`,
        thesis: pos.thesis,
        isWin: isTpHit
      };

      newlyClosedTrades.push(closedTrade);

      // Log into global Trade Journal too
      logCompletedTrade({
        ticker: pos.ticker,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        size: pos.size,
        pnlUSD: realizedPnlUSD,
        strategy: `Hermes Auto (${pos.convictionGrade})`,
        tags: [isTpHit ? '2R Target Hit' : 'Stop Loss Executed', 'Hermes Forward-Test', 'Followed Plan'],
        notes: `Autonomous Forward-Test Execution: ${closedTrade.exitReason}. Thesis: ${pos.thesis}`
      });

      // Update paper balance
      account.balance = Number((account.balance + realizedPnlUSD).toFixed(2));
      account.realizedPnlUSD = Number((account.realizedPnlUSD + realizedPnlUSD).toFixed(2));
      account.totalTrades += 1;
      if (isTpHit) account.winningTrades += 1;
      else account.losingTrades += 1;

    } else {
      // Position remains open, update unrealized metrics
      remainingPositions.push({
        ...pos,
        currentPrice,
        unrealizedPnlUSD,
        unrealizedRoiPct
      });
    }
  }

  savePaperPositions(remainingPositions);

  if (newlyClosedTrades.length > 0) {
    savePaperTradeHistory([...newlyClosedTrades, ...history]);
    savePaperAccount(account);
  }

  return {
    closedTrades: newlyClosedTrades,
    openPositions: remainingPositions,
    account
  };
}

/**
 * Reset Paper Trading Account & History
 */
export function resetPaperTradingAccount() {
  savePaperAccount(DEFAULT_PAPER_ACCOUNT);
  savePaperPositions([]);
  savePaperTradeHistory([]);
  return { ...DEFAULT_PAPER_ACCOUNT };
}

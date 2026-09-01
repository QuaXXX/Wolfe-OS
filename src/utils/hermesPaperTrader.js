/**
 * Hermes Autonomous Forward-Test Paper Trader Engine
 * 100% Mathematically Rigorous Execution matching TradingView & Hyperliquid L1 clearinghouse:
 * - Realized / Unrealized PnL ($) = (Current Price - Entry Price) * Contracts (for Long)
 * - ROE % (Return on Margin) = (Unrealized PnL / Margin USD) * 100 = Price Move % * Leverage
 * - Current R-Multiple = (Current Price - Entry Price) / (Entry Price - Stop Loss Price)
 */

import { calculateDynamicPositionSize } from './hyperliquidService.js';
import { logCompletedTrade } from './tradingStorage.js';

const STORAGE_KEY_PAPER_ACCOUNT = 'wolfe_hermes_paper_account_v1';
const STORAGE_KEY_PAPER_POSITIONS = 'wolfe_hermes_paper_positions_v1';
const STORAGE_KEY_PAPER_HISTORY = 'wolfe_hermes_paper_history_v1';

export const DEFAULT_PAPER_ACCOUNT = {
  balance: 10000.00,
  startingBalance: 10000.00,
  isAutoTradingEnabled: false,
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

export function resetPaperTradingAccount() {
  const fresh = { ...DEFAULT_PAPER_ACCOUNT };
  savePaperAccount(fresh);
  savePaperPositions([]);
  savePaperTradeHistory([]);
  return fresh;
}

export function deletePaperPosition(posId) {
  const current = getPaperPositions();
  const filtered = current.filter(p => p.id !== posId);
  savePaperPositions(filtered);
  return filtered;
}

export function deletePaperHistoryTrade(tradeId) {
  const current = getPaperTradeHistory();
  const filtered = current.filter(t => t.id !== tradeId);
  savePaperTradeHistory(filtered);
  return filtered;
}

/**
 * Instantly convert a resting pending limit order into an active position at current market price
 */
export function executePendingPositionAtMarket(posId, livePrice) {
  const positions = getPaperPositions();
  const target = positions.find(p => p.id === posId);
  if (!target) return positions;

  const currentLivePrice = livePrice ? Number(livePrice) : target.entryPrice;
  const isLong = target.side === 'LONG';
  const riskDistance = Math.abs(target.entryPrice - target.stopLoss);

  const newStopLoss = isLong 
    ? Number((currentLivePrice - riskDistance).toFixed(2))
    : Number((currentLivePrice + riskDistance).toFixed(2));

  const newTakeProfit = isLong
    ? Number((currentLivePrice + riskDistance * 2).toFixed(2))
    : Number((currentLivePrice - riskDistance * 2).toFixed(2));

  const updatedPositions = positions.map(pos => {
    if (pos.id === posId) {
      return {
        ...pos,
        status: 'ACTIVE',
        executionType: 'MARKET_FILL',
        entryPrice: currentLivePrice,
        currentPrice: currentLivePrice,
        stopLoss: newStopLoss,
        takeProfit: newTakeProfit,
        triggeredAt: new Date().toISOString(),
        unrealizedPnlUSD: 0.00,
        spotMovePct: 0.00,
        roePct: 0.00,
        rMultiple: 0.00
      };
    }
    return pos;
  });

  savePaperPositions(updatedPositions);
  return updatedPositions;
}

/**
 * 1. Enter a Single Play with Exact Sizing, Limit Trigger or Immediate Market Fill
 * @param {Object} play - Candidate trade setup
 * @param {string} briefDate - Date of the brief
 * @param {Object} livePrices - Map of live asset prices
 * @param {string} executionMode - 'LIMIT' | 'MARKET' | 'AUTO'
 */
export function enterSingleHermesPlay(play, briefDate = '', livePrices = {}, executionMode = 'AUTO') {
  if (!play) return null;
  const account = getPaperAccount();
  const existingPositions = getPaperPositions();

  const ticker = (play.ticker || 'BTC').toUpperCase();
  const isLong = (play.bias || 'LONG').toUpperCase() === 'LONG';

  // Parse numeric planned entry, stop loss, and take profit
  const entryMatches = String(play.entryTrigger).match(/\$?([0-9,.]+)/);
  const plannedLimitEntryPrice = entryMatches ? Number(entryMatches[1].replace(/,/g, '')) : 100;

  const stopMatches = String(play.stopLoss).match(/\$?([0-9,.]+)/);
  let stopLoss = stopMatches ? Number(stopMatches[1].replace(/,/g, '')) : (isLong ? plannedLimitEntryPrice * 0.98 : plannedLimitEntryPrice * 1.02);

  const tpMatches = String(play.target2R).match(/\$?([0-9,.]+)/);
  let takeProfit = tpMatches ? Number(tpMatches[1].replace(/,/g, '')) : (isLong ? plannedLimitEntryPrice + Math.abs(plannedLimitEntryPrice - stopLoss) * 2 : plannedLimitEntryPrice - Math.abs(plannedLimitEntryPrice - stopLoss) * 2);

  const leverage = account.leverage || 5;
  const currentLivePrice = livePrices[ticker] ? Number(livePrices[ticker]) : plannedLimitEntryPrice;

  let actualEntryPrice = plannedLimitEntryPrice;
  let isImmediatelyActive = false;

  if (executionMode === 'MARKET') {
    // ⚡ MARKET ORDER: Instant fill at current live market price
    actualEntryPrice = currentLivePrice;
    isImmediatelyActive = true;

    // Recalculate Stop Loss and 2R Take Profit relative to actual live market fill
    const riskDistance = Math.abs(plannedLimitEntryPrice - stopLoss);
    if (isLong) {
      stopLoss = Number((actualEntryPrice - riskDistance).toFixed(2));
      takeProfit = Number((actualEntryPrice + riskDistance * 2).toFixed(2));
    } else {
      stopLoss = Number((actualEntryPrice + riskDistance).toFixed(2));
      takeProfit = Number((actualEntryPrice - riskDistance * 2).toFixed(2));
    }
  } else {
    // 🎯 LIMIT ORDER: Check if live price is already touching or through limit price
    actualEntryPrice = plannedLimitEntryPrice;
    if (isLong) {
      if (currentLivePrice <= plannedLimitEntryPrice * 1.001) isImmediatelyActive = true;
    } else {
      if (currentLivePrice >= plannedLimitEntryPrice * 0.999) isImmediatelyActive = true;
    }
  }

  const sizing = calculateDynamicPositionSize({
    accountEquity: account.balance,
    riskPercent: account.riskPercent || 1.5,
    entryPrice: actualEntryPrice,
    stopLossPrice: stopLoss,
    leverage,
    asset: ticker
  });

  const priceDiff = isImmediatelyActive 
    ? (isLong ? (currentLivePrice - actualEntryPrice) : (actualEntryPrice - currentLivePrice))
    : 0;
  
  const unrealizedPnlUSD = Number((priceDiff * sizing.contracts).toFixed(2));
  const spotMovePct = Number(((priceDiff / actualEntryPrice) * 100).toFixed(2));
  const roePct = Number(((unrealizedPnlUSD / Math.max(1, sizing.requiredMarginUSD)) * 100).toFixed(2));
  const rMultiple = Math.abs(actualEntryPrice - stopLoss) > 0 
    ? Number((priceDiff / Math.abs(actualEntryPrice - stopLoss)).toFixed(2))
    : 0;

  const position = {
    id: `paper_${Date.now()}_${ticker}_${Math.random().toString(36).substring(2, 6)}`,
    ticker,
    side: isLong ? 'LONG' : 'SHORT',
    entryPrice: actualEntryPrice,
    plannedLimitPrice: plannedLimitEntryPrice,
    executionType: executionMode === 'MARKET' ? 'MARKET_FILL' : 'LIMIT_ORDER',
    currentPrice: isImmediatelyActive ? currentLivePrice : actualEntryPrice,
    stopLoss,
    takeProfit,
    target3R: play.target3R,
    size: sizing.contracts,
    notionalUSD: sizing.notionalValueUSD,
    marginUSD: sizing.requiredMarginUSD,
    riskUSD: sizing.riskUSD,
    leverage,
    timeframe: play.timeframe || '1H - 4H Intraday',
    expectedDuration: play.expectedDuration || '3 - 8 Hours',
    thesis: play.thesis,
    convictionGrade: play.convictionGrade || 'A+',
    briefDate: briefDate || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    triggeredAt: isImmediatelyActive ? new Date().toISOString() : null,
    status: isImmediatelyActive ? 'ACTIVE' : 'PENDING_ENTRY',
    unrealizedPnlUSD: isImmediatelyActive ? unrealizedPnlUSD : 0.00,
    spotMovePct: isImmediatelyActive ? spotMovePct : 0.00,
    roePct: isImmediatelyActive ? roePct : 0.00,
    rMultiple: isImmediatelyActive ? rMultiple : 0.00
  };

  savePaperPositions([position, ...existingPositions]);
  return position;
}

/**
 * 2. Real-Time TP / SL Monitor Engine with Exact Exchange Math
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

    // 1. If Position is PENDING ENTRY: check if limit price touched in real market
    if (pos.status === 'PENDING_ENTRY') {
      let isEntryTriggered = false;
      if (isLong && currentPrice <= pos.entryPrice * 1.001) {
        isEntryTriggered = true;
      } else if (!isLong && currentPrice >= pos.entryPrice * 0.999) {
        isEntryTriggered = true;
      }

      if (isEntryTriggered) {
        remainingPositions.push({
          ...pos,
          status: 'ACTIVE',
          triggeredAt: new Date().toISOString(),
          currentPrice: pos.entryPrice,
          unrealizedPnlUSD: 0.00,
          spotMovePct: 0.00,
          roePct: 0.00,
          rMultiple: 0.00
        });
      } else {
        remainingPositions.push({
          ...pos,
          currentPrice
        });
      }
      continue;
    }

    // 2. If Position is ACTIVE: Calculate Exact PnL, Spot % & ROE %
    const priceDiff = isLong ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
    const unrealizedPnlUSD = Number((priceDiff * pos.size).toFixed(2));
    const spotMovePct = Number(((priceDiff / pos.entryPrice) * 100).toFixed(2));
    const margin = Math.max(1, pos.marginUSD || (pos.size * pos.entryPrice / Math.max(1, pos.leverage)));
    const roePct = Number(((unrealizedPnlUSD / margin) * 100).toFixed(2));
    const stopDistance = Math.max(0.0001, Math.abs(pos.entryPrice - pos.stopLoss));
    const rMultiple = Number((priceDiff / stopDistance).toFixed(2));

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
      // Trade Settled
      const exitPrice = isTpHit ? pos.takeProfit : pos.stopLoss;
      const realizedPriceDiff = isLong ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
      const realizedPnlUSD = Number((realizedPriceDiff * pos.size).toFixed(2));
      const realizedRoePct = Number(((realizedPnlUSD / margin) * 100).toFixed(2));
      const realizedSpotPct = Number(((realizedPriceDiff / pos.entryPrice) * 100).toFixed(2));
      const realizedRMultiple = Number((realizedPriceDiff / stopDistance).toFixed(2));

      const closedTrade = {
        id: pos.id,
        ticker: pos.ticker,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        size: pos.size,
        pnlUSD: realizedPnlUSD,
        roePct: realizedRoePct,
        spotMovePct: realizedSpotPct,
        rMultiple: realizedRMultiple,
        openedAt: pos.triggeredAt || pos.createdAt,
        closedAt: new Date().toISOString(),
        timeframe: pos.timeframe || '1H - 4H Intraday',
        exitReason: isTpHit ? 'TAKE_PROFIT_HIT (2R)' : 'STOP_LOSS_HIT (Invalidation)',
        strategy: `Hermes Forward-Test (${pos.convictionGrade})`,
        thesis: pos.thesis,
        isWin: isTpHit
      };

      newlyClosedTrades.push(closedTrade);

      // Log into global Trade Journal
      logCompletedTrade({
        ticker: pos.ticker,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice,
        size: pos.size,
        pnlUSD: realizedPnlUSD,
        strategy: `Hermes Forward-Test (${pos.convictionGrade})`,
        notes: `${pos.thesis} (Exit: ${closedTrade.exitReason})`,
        screenshot: '',
        aiPostMortem: isTpHit 
          ? `Target 2R hit with +${realizedRoePct}% ROE on ${pos.side} setup.`
          : `Stopped out at invalidation with ${realizedRoePct}% ROE.`
      });

      // Update Account balance
      account.balance = Number((account.balance + realizedPnlUSD).toFixed(2));
      account.realizedPnlUSD = Number((account.realizedPnlUSD + realizedPnlUSD).toFixed(2));
      account.totalTrades += 1;
      if (isTpHit) account.winningTrades += 1;
      else account.losingTrades += 1;
    } else {
      remainingPositions.push({
        ...pos,
        currentPrice,
        unrealizedPnlUSD,
        spotMovePct,
        roePct,
        rMultiple
      });
    }
  }

  if (newlyClosedTrades.length > 0) {
    savePaperAccount(account);
    savePaperTradeHistory([...newlyClosedTrades, ...history]);
  }

  savePaperPositions(remainingPositions);
  return { closedTrades: newlyClosedTrades, openPositions: remainingPositions };
}

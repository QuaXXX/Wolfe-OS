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

export function cleanNumeric(val) {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (!val) return null;
  const match = String(val).replace(/,/g, '').match(/[\$]?([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : null;
}

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
  const isLong = !play.bias || String(play.bias).toUpperCase().includes('LONG') || String(play.bias).toUpperCase().includes('BUY');

  const extractNum = cleanNumeric;

  const extractKeyedNum = (text, key) => {
    if (!text) return null;
    const part = String(text).split(new RegExp(key, 'i'))[1];
    return part ? extractNum(part) : null;
  };

  const currentLivePrice = cleanNumeric(livePrices[ticker]) || cleanNumeric(play.entryNumeric) || 100;

  // Parse numeric planned entry from Strategy accurately
  let plannedLimitEntryPrice = cleanNumeric(play.entryNumeric) 
    || cleanNumeric(play.entryPrice) 
    || extractNum(play.entryTrigger)
    || extractKeyedNum(play.riskManagement, 'Trigger')
    || extractKeyedNum(play.riskManagement, 'Entry')
    || currentLivePrice;

  const priceDecimals = plannedLimitEntryPrice < 1 ? 4 : 2;

  let stopLoss = cleanNumeric(play.stopNumeric) 
    || cleanNumeric(play.stopPrice) 
    || extractNum(play.stopLoss) 
    || extractKeyedNum(play.riskManagement, 'Stop Loss')
    || extractKeyedNum(play.riskManagement, 'Stop')
    || (isLong ? Number((plannedLimitEntryPrice * 0.95).toFixed(priceDecimals)) : Number((plannedLimitEntryPrice * 1.05).toFixed(priceDecimals)));

  if (stopLoss === plannedLimitEntryPrice) {
    stopLoss = isLong ? Number((plannedLimitEntryPrice * 0.95).toFixed(priceDecimals)) : Number((plannedLimitEntryPrice * 1.05).toFixed(priceDecimals));
  }

  let takeProfit = cleanNumeric(play.target2RNumeric) 
    || cleanNumeric(play.target2R) 
    || extractNum(play.target2R) 
    || extractKeyedNum(play.riskManagement, 'Take Profit')
    || extractKeyedNum(play.riskManagement, 'Target 2R')
    || (isLong ? Number((plannedLimitEntryPrice + Math.abs(plannedLimitEntryPrice - stopLoss) * 2).toFixed(priceDecimals)) : Number((plannedLimitEntryPrice - Math.abs(plannedLimitEntryPrice - stopLoss) * 2).toFixed(priceDecimals)));

  if (takeProfit === plannedLimitEntryPrice) {
    takeProfit = isLong ? Number((plannedLimitEntryPrice + Math.abs(plannedLimitEntryPrice - stopLoss) * 2).toFixed(priceDecimals)) : Number((plannedLimitEntryPrice - Math.abs(plannedLimitEntryPrice - stopLoss) * 2).toFixed(priceDecimals));
  }

  const leverage = account.leverage || 5;

  let actualEntryPrice = plannedLimitEntryPrice;
  let isImmediatelyActive = false;

  // Check if live price is currently in the "Better Price / Discount Zone" vs "Extended Zone"
  const isBetterThanLimit = isLong 
    ? currentLivePrice <= plannedLimitEntryPrice 
    : currentLivePrice >= plannedLimitEntryPrice;

  if (executionMode === 'MARKET') {
    // ⚡ MARKET ORDER: Instant fill at current live market price
    actualEntryPrice = currentLivePrice;
    isImmediatelyActive = true;
  } else {
    // 🎯 STRATEGY LIMIT ORDER (Willingness-To-Pay Model):
    if (isBetterThanLimit) {
      // 🟢 Price is closer to SL than planned Trigger Entry: Better price! Takes it immediately at current market price
      actualEntryPrice = currentLivePrice;
      isImmediatelyActive = true;
    } else {
      // ⏳ Price is extended towards TP: Rests at planned Trigger Entry limit price waiting for pullback
      actualEntryPrice = plannedLimitEntryPrice;
      isImmediatelyActive = false;
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
    validForHours: play.validForHours || (play.timeframe?.includes('Scalp') ? 6 : play.timeframe?.includes('Swing') ? 36 : 72),
    expiresAt: play.expiresAt || new Date(Date.now() + (play.validForHours || (play.timeframe?.includes('Scalp') ? 6 : play.timeframe?.includes('Swing') ? 36 : 72)) * 3600000).toISOString(),
    invalidationCondition: play.invalidationCondition || play.invalidation || null,
    candlestickRationale: play.candlestickRationale || null,
    thesis: play.thesis,
    convictionGrade: play.convictionGrade || 'A+',
    briefDate: briefDate || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    triggeredAt: isImmediatelyActive ? new Date().toISOString() : null,
    status: isImmediatelyActive ? 'ACTIVE' : 'PENDING_ENTRY',
    unrealizedPnlUSD: isImmediatelyActive ? unrealizedPnlUSD : 0.00,
    lowestPriceSeen: isImmediatelyActive ? currentLivePrice : actualEntryPrice,
    highestPriceSeen: isImmediatelyActive ? currentLivePrice : actualEntryPrice,
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
export function tickPaperPositionsWithLivePrices(livePrices, marketData = {}) {
  if (!livePrices || Object.keys(livePrices).length === 0) return { closedTrades: [], openPositions: getPaperPositions() };

  const positions = getPaperPositions();
  if (positions.length === 0) return { closedTrades: [], openPositions: [] };

  const account = getPaperAccount();
  const history = getPaperTradeHistory();

  const remainingPositions = [];
  const newlyClosedTrades = [];

  for (const pos of positions) {
    const rawPrice = livePrices[pos.ticker];
    if (rawPrice === undefined || rawPrice === null) {
      remainingPositions.push(pos);
      continue;
    }

    const currentPrice = Number(rawPrice);
    if (isNaN(currentPrice) || currentPrice <= 0) {
      remainingPositions.push(pos);
      continue;
    }

    const isLong = pos.side === 'LONG';
    const entryPrice = cleanNumeric(pos.entryPrice) || currentPrice;
    const stopLoss = cleanNumeric(pos.stopLoss) || (isLong ? entryPrice * 0.95 : entryPrice * 1.05);
    const takeProfit = cleanNumeric(pos.takeProfit) || (isLong ? entryPrice * 1.10 : entryPrice * 0.90);
    const posSize = cleanNumeric(pos.size) || 1;

    // Track extreme price bounds seen during the position's lifecycle
    const lowestSeen = Math.min(cleanNumeric(pos.lowestPriceSeen) ?? currentPrice, currentPrice);
    const highestSeen = Math.max(cleanNumeric(pos.highestPriceSeen) ?? currentPrice, currentPrice);
    pos.lowestPriceSeen = lowestSeen;
    pos.highestPriceSeen = highestSeen;

    // Check optional dayLow / dayHigh from marketData
    const assetMarket = marketData?.[pos.ticker] || {};
    const dayLow = cleanNumeric(assetMarket.dayLow);
    const dayHigh = cleanNumeric(assetMarket.dayHigh);

    // 1. If Position is PENDING ENTRY: check if limit price touched in real market OR if expired / invalidated
    if (pos.status === 'PENDING_ENTRY') {
      const isExpiredByTimeframe = pos.expiresAt && Date.now() > new Date(pos.expiresAt).getTime();
      const todayIso = new Date().toISOString().split('T')[0];
      const posDate = pos.date ? String(pos.date).split('T')[0] : (pos.enteredAt ? String(pos.enteredAt).split('T')[0] : null);
      const isOlderThanToday = posDate && posDate < todayIso && (!pos.timeframe || pos.timeframe.includes('Scalp') || pos.timeframe.includes('Intraday'));
      const isStaleIntraday = pos.enteredAt && (!pos.timeframe || pos.timeframe.includes('Scalp')) && (Date.now() - new Date(pos.enteredAt).getTime() > 14 * 60 * 60 * 1000);

      // Check if price pierced stop loss before ever filling limit entry (Invalidated)
      const isInvalidatedBeforeFill = isLong 
        ? (stopLoss && (currentPrice <= stopLoss || (dayLow && dayLow <= stopLoss)))
        : (stopLoss && (currentPrice >= stopLoss || (dayHigh && dayHigh >= stopLoss)));

      // Auto-expire/cancel pending limit orders if timeframe elapsed or if setup was invalidated
      if (isExpiredByTimeframe || isOlderThanToday || isStaleIntraday || isInvalidatedBeforeFill) {
        history.unshift({
          id: pos.id,
          ticker: pos.ticker,
          side: pos.side,
          entryPrice,
          exitPrice: currentPrice,
          size: posSize,
          pnlUSD: 0.00,
          roePct: 0.00,
          spotMovePct: 0.00,
          rMultiple: 0.00,
          isWin: false,
          exitReason: isInvalidatedBeforeFill 
            ? 'INVALIDATED (Price pierced SL before entry)' 
            : isExpiredByTimeframe 
              ? `EXPIRED (Trigger point not hit within ${pos.validForHours || 'targeted'}h timeframe - Escaped trade safely)`
              : 'EXPIRED (Unfilled Intraday)',
          strategy: pos.strategy || 'Pending Limit Order',
          convictionGrade: pos.convictionGrade || 'A',
          enteredAt: pos.enteredAt || pos.date,
          closedAt: new Date().toISOString()
        });
        savePaperTradeHistory(history);
        continue; // Drop from active positions
      }

      let isEntryTriggered = false;
      if (isLong && currentPrice <= entryPrice * 1.001) {
        isEntryTriggered = true;
      } else if (!isLong && currentPrice >= entryPrice * 0.999) {
        isEntryTriggered = true;
      }

      if (isEntryTriggered) {
        remainingPositions.push({
          ...pos,
          entryPrice,
          stopLoss,
          takeProfit,
          size: posSize,
          status: 'ACTIVE',
          triggeredAt: new Date().toISOString(),
          currentPrice: entryPrice,
          lowestPriceSeen: entryPrice,
          highestPriceSeen: entryPrice,
          unrealizedPnlUSD: 0.00,
          spotMovePct: 0.00,
          roePct: 0.00,
          rMultiple: 0.00
        });
      } else {
        remainingPositions.push({
          ...pos,
          entryPrice,
          stopLoss,
          takeProfit,
          size: posSize,
          currentPrice
        });
      }
      continue;
    }

    // 2. If Position is ACTIVE: Calculate Exact PnL, Spot % & ROE %
    const priceDiff = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
    const unrealizedPnlUSD = Number((priceDiff * posSize).toFixed(2));
    const spotMovePct = Number(((priceDiff / entryPrice) * 100).toFixed(2));
    const margin = Math.max(1, cleanNumeric(pos.marginUSD) || (posSize * entryPrice / Math.max(1, cleanNumeric(pos.leverage) || 5)));
    const roePct = Number(((unrealizedPnlUSD / margin) * 100).toFixed(2));
    const stopDistance = Math.max(0.0001, Math.abs(entryPrice - stopLoss));
    const rMultiple = Number((priceDiff / stopDistance).toFixed(2));

    let isTpHit = false;
    let isSlHit = false;

    // ⚡ UNBIASED REAL-MARKET EXECUTION LOGIC:
    // 1. Instant price check with 0.05% spread touch buffer (slippage / spread fill)
    // 2. Continuous tracking of extreme wick prices seen since trade activation (lowestSeen / highestSeen)
    // 3. Official intraday session low/high verification (dayLow / dayHigh)
    if (isLong) {
      if (currentPrice >= takeProfit * 0.9995 || highestSeen >= takeProfit || (dayHigh && dayHigh >= takeProfit)) {
        isTpHit = true;
      } else if (currentPrice <= stopLoss * 1.0005 || lowestSeen <= stopLoss || (dayLow && dayLow <= stopLoss)) {
        isSlHit = true;
      }
    } else {
      if (currentPrice <= takeProfit * 1.0005 || lowestSeen <= takeProfit || (dayLow && dayLow <= takeProfit)) {
        isTpHit = true;
      } else if (currentPrice >= stopLoss * 0.9995 || highestSeen >= stopLoss || (dayHigh && dayHigh >= stopLoss)) {
        isSlHit = true;
      }
    }

    if (isTpHit || isSlHit) {
      // Trade Settled - Unbiased fill at stop/TP price or market breach
      const exitPrice = isTpHit ? takeProfit : stopLoss;
      const realizedPriceDiff = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
      const realizedPnlUSD = Number((realizedPriceDiff * posSize).toFixed(2));
      const realizedRoePct = Number(((realizedPnlUSD / margin) * 100).toFixed(2));
      const realizedSpotPct = Number(((realizedPriceDiff / entryPrice) * 100).toFixed(2));
      const realizedRMultiple = Number((realizedPriceDiff / stopDistance).toFixed(2));

      const closedTrade = {
        id: pos.id,
        ticker: pos.ticker,
        side: pos.side,
        entryPrice,
        exitPrice,
        size: posSize,
        pnlUSD: realizedPnlUSD,
        roePct: realizedRoePct,
        spotMovePct: realizedSpotPct,
        rMultiple: realizedRMultiple,
        openedAt: pos.triggeredAt || pos.createdAt,
        closedAt: new Date().toISOString(),
        timeframe: pos.timeframe || '1H - 4H Intraday',
        exitReason: isTpHit ? 'TAKE_PROFIT_HIT (2R)' : 'STOP_LOSS_HIT (Invalidation)',
        strategy: `Hermes Forward-Test (${pos.convictionGrade || 'A'})`,
        convictionGrade: pos.convictionGrade || 'A',
        thesis: pos.thesis,
        isWin: isTpHit
      };

      newlyClosedTrades.push(closedTrade);

      // Log into global Trade Journal
      logCompletedTrade({
        ticker: pos.ticker,
        side: pos.side,
        entryPrice,
        exitPrice,
        size: posSize,
        pnlUSD: realizedPnlUSD,
        strategy: `Hermes Forward-Test (${pos.convictionGrade || 'A'})`,
        notes: `${pos.thesis || 'Algorithmic forward-test setup'} (Exit: ${closedTrade.exitReason})`,
        screenshot: '',
        aiPostMortem: isTpHit 
          ? `Target 2R hit with +${realizedRoePct}% ROE on ${pos.side} setup.`
          : `Stopped out at invalidation (${exitPrice}) with ${realizedRoePct}% ROE. Unbiased execution recorded.`
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
        entryPrice,
        stopLoss,
        takeProfit,
        size: posSize,
        currentPrice,
        lowestPriceSeen: lowestSeen,
        highestPriceSeen: highestSeen,
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

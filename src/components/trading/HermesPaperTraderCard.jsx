import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Clock, 
  Target, 
  ShieldAlert, 
  Trash2, 
  RefreshCw, 
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Hourglass,
  Layers,
  Zap,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { 
  getPaperAccount, 
  savePaperAccount, 
  getPaperPositions, 
  getPaperTradeHistory, 
  deletePaperPosition, 
  deletePaperHistoryTrade, 
  resetPaperTradingAccount,
  executePendingPositionAtMarket
} from '../../utils/hermesPaperTrader';
import { playSound } from '../../utils/soundFX';

export const HermesPaperTraderCard = ({
  latestBrief,
  livePrices = {},
  onPositionChanged,
  onOpenHyperliquid,
  soundEnabled = true
}) => {
  const [account, setAccount] = useState(getPaperAccount());
  const [paperPositions, setPaperPositions] = useState(getPaperPositions());
  const [paperHistory, setPaperHistory] = useState(getPaperTradeHistory());
  const [activeSubTab, setActiveSubTab] = useState('open'); // 'open' | 'history'
  const [expandedTradeId, setExpandedTradeId] = useState(null);

  const refreshState = () => {
    setAccount(getPaperAccount());
    setPaperPositions(getPaperPositions());
    setPaperHistory(getPaperTradeHistory());
  };

  useEffect(() => {
    refreshState();
  }, [livePrices]);

  const handleDeletePosition = (posId, e) => {
    if (e) e.stopPropagation();
    playSound('click', soundEnabled);
    const updated = deletePaperPosition(posId);
    setPaperPositions(updated);
    if (onPositionChanged) onPositionChanged();
  };

  const handleDeleteHistory = (tradeId, e) => {
    if (e) e.stopPropagation();
    playSound('click', soundEnabled);
    const updated = deletePaperHistoryTrade(tradeId);
    setPaperHistory(updated);
    if (onPositionChanged) onPositionChanged();
  };

  const handleFillPendingAtMarket = (posId, currentLivePrice, e) => {
    if (e) e.stopPropagation();
    playSound('click', soundEnabled);
    const updated = executePendingPositionAtMarket(posId, currentLivePrice);
    setPaperPositions(updated);
    playSound('success', soundEnabled);
    if (onPositionChanged) onPositionChanged();
  };

  const handleResetAccount = () => {
    if (window.confirm("Reset Forward Test Account back to $10,000.00?")) {
      playSound('click', soundEnabled);
      const res = resetPaperTradingAccount();
      setAccount(res);
      setPaperPositions([]);
      setPaperHistory([]);
      if (onPositionChanged) onPositionChanged();
    }
  };

  const winRate = account.totalTrades > 0 
    ? ((account.winningTrades / account.totalTrades) * 100).toFixed(1)
    : '0.0';

  const totalUnrealizedPnl = paperPositions
    .filter(p => p.status === 'ACTIVE')
    .reduce((acc, pos) => acc + (pos.unrealizedPnlUSD || 0), 0);

  return (
    <div className="space-y-3 font-sans">
      {/* 1. Header & Performance Metrics HUD */}
      <GlassCard hoverEffect={false} className="p-3.5 space-y-3">
        <div 
          className="flex items-center justify-between pb-2.5 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-7 h-7 rounded-xl border flex items-center justify-center"
              style={{ 
                backgroundColor: 'var(--accent-subtle)',
                borderColor: 'var(--accent-border)'
              }}
            >
              <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white tracking-wide">
                  Forward Test Desk
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Live Simulation
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAccount}
              title="Reset account"
              className="px-2 py-1 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] text-[11px] font-medium transition-colors cursor-pointer border border-white/5 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* HUD Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div className="p-2 rounded-xl bg-black/30 border border-white/5">
            <div className="text-[9px] uppercase text-slate-400">Account Value</div>
            <div className="text-sm font-bold text-white mt-0.5">${account.balance?.toFixed(2) || '10,000.00'}</div>
          </div>

          <div className="p-2 rounded-xl bg-black/30 border border-white/5">
            <div className="text-[9px] uppercase text-slate-400">Unrealized P&L</div>
            <div className={`text-sm font-bold mt-0.5 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnl >= 0 ? `+$${totalUnrealizedPnl.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnl).toFixed(2)}`}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-black/30 border border-white/5">
            <div className="text-[9px] uppercase text-slate-400">Win Rate</div>
            <div className="text-sm font-bold text-white mt-0.5">{winRate}% <span className="text-[10px] text-slate-400 font-sans font-normal">({account.winningTrades}/{account.totalTrades})</span></div>
          </div>

          <div className="p-2 rounded-xl bg-black/30 border border-white/5">
            <div className="text-[9px] uppercase text-slate-400">Realized P&L</div>
            <div className={`text-sm font-bold mt-0.5 ${account.realizedPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {account.realizedPnlUSD >= 0 ? `+$${account.realizedPnlUSD.toFixed(2)}` : `-$${Math.abs(account.realizedPnlUSD).toFixed(2)}`}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 2. Sub-Tab Switcher */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5 w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('open')}
          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'open'
              ? 'text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          style={activeSubTab === 'open' ? { 
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent-primary)'
          } : {}}
        >
          Tracked Trades ({paperPositions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          style={activeSubTab === 'history' ? { 
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent-primary)'
          } : {}}
        >
          Completed ({paperHistory.length})
        </button>
      </div>

      {/* 3. Sub-Tab 1: Live Positions */}
      {activeSubTab === 'open' && (
        <div className="space-y-2">
          {paperPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {paperPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const isPending = pos.status === 'PENDING_ENTRY';
                const currentPrice = pos.currentPrice || pos.entryPrice;
                const isProfitable = (pos.unrealizedPnlUSD || 0) >= 0;
                const isExpanded = expandedTradeId === pos.id;

                // Progress towards TP vs SL
                const totalRange = Math.abs(pos.takeProfit - pos.stopLoss);
                const distanceCovered = isLong ? (currentPrice - pos.stopLoss) : (pos.stopLoss - currentPrice);
                const progressPct = Math.max(0, Math.min(100, (distanceCovered / totalRange) * 100));

                return (
                  <GlassCard 
                    key={pos.id} 
                    hoverEffect={false} 
                    className={`p-3.5 space-y-2.5 transition-all cursor-pointer border ${
                      isExpanded ? 'border-white/20 bg-white/[0.04]' : 'border-white/5 hover:border-white/10'
                    }`}
                    onClick={() => setExpandedTradeId(isExpanded ? null : pos.id)}
                  >
                    {/* Summary Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-sm font-bold text-white">{pos.ticker}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-white/[0.05] text-slate-200 border border-white/10">
                          {pos.side} {pos.leverage}x
                        </span>

                        {isPending ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 font-sans">
                            <Hourglass className="w-3 h-3 text-amber-400" />
                            <span>Pending Entry</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-semibold font-sans">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Active</span>
                          </span>
                        )}

                        {/* Timestamp Badge */}
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1" title={pos.createdAt ? `Placed: ${new Date(pos.createdAt).toLocaleString()}` : ''}>
                          <Clock className="w-2.5 h-2.5 text-slate-500" />
                          <span>{pos.createdAt ? (new Date(pos.createdAt).toDateString() === new Date().toDateString() ? new Date(pos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(pos.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })) : 'Today'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {!isPending ? (
                          <div className="text-right font-mono">
                            <div className={`text-xs font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfitable ? `+$${(pos.unrealizedPnlUSD || 0).toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnlUSD || 0).toFixed(2)}`}
                            </div>
                            <div className="text-[10px] text-slate-300">
                              ROE: <strong className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>{pos.roePct > 0 ? `+${pos.roePct}` : pos.roePct}%</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="text-right font-mono text-slate-400 text-xs font-bold">
                            @ ${pos.entryPrice}
                          </div>
                        )}

                        <div className="p-1 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar (Visible Always) with Proportional Red/Green Track */}
                    {(() => {
                      const isLong = pos.direction === 'LONG' || !pos.direction || String(pos.direction).toUpperCase().includes('BUY');
                      const stopLoss = Number(pos.stopLoss) || 0;
                      const entryPrice = Number(pos.entryPrice) || Number(pos.plannedLimitPrice) || 0;
                      const takeProfit = Number(pos.takeProfit) || 0;
                      const curPrice = Number(currentPrice) || entryPrice;

                      const riskSpan = Math.max(0.001, Math.abs(entryPrice - stopLoss));
                      const rewardSpan = Math.max(0.001, Math.abs(takeProfit - entryPrice));
                      const totalSpan = riskSpan + rewardSpan;
                      const entryDividerPct = (riskSpan / totalSpan) * 100;

                      let liveDotPct = entryDividerPct;
                      if (isLong) {
                        if (curPrice <= stopLoss) liveDotPct = 0;
                        else if (curPrice >= takeProfit) liveDotPct = 100;
                        else liveDotPct = Math.max(0, Math.min(100, ((curPrice - stopLoss) / (takeProfit - stopLoss)) * 100));
                      } else {
                        if (curPrice >= stopLoss) liveDotPct = 0;
                        else if (curPrice <= takeProfit) liveDotPct = 100;
                        else liveDotPct = Math.max(0, Math.min(100, ((stopLoss - curPrice) / (stopLoss - takeProfit)) * 100));
                      }

                      return (
                        <div className="space-y-1.5 font-mono">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span className="text-rose-400 font-semibold">SL: ${pos.stopLoss}</span>
                            <span className="text-white font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-primary)' }} />
                              <span>Price: <strong style={{ color: 'var(--accent-primary)' }}>${curPrice}</strong></span>
                            </span>
                            <span className="text-emerald-400 font-semibold">TP: ${pos.takeProfit}</span>
                          </div>

                          <div className="relative pt-1 pb-1">
                            <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden flex relative border border-white/10 shadow-inner">
                              <div 
                                className="h-full bg-gradient-to-r from-rose-600/70 to-rose-500/40 border-r border-white/40" 
                                style={{ width: `${entryDividerPct}%` }} 
                              />
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-500/40 to-emerald-500/70" 
                                style={{ width: `${100 - entryDividerPct}%` }} 
                              />
                            </div>

                            {/* Limit Entry Marker Line */}
                            <div 
                              className="absolute top-0 bottom-0 transform -translate-x-1/2 flex flex-col items-center pointer-events-none z-10"
                              style={{ left: `${entryDividerPct}%` }}
                            >
                              <div className="w-1 h-3.5 bg-white rounded-full shadow-md" />
                            </div>

                            {/* Live Market Price Dot */}
                            <div 
                              className="absolute top-0.5 transform -translate-x-1/2 -mt-0.5 transition-all duration-300 pointer-events-none z-20"
                              style={{ left: `${liveDotPct}%` }}
                              title={`Live Price: $${curPrice}`}
                            >
                              <div 
                                className="w-3 h-3 rounded-full ring-2 ring-white shadow-lg flex items-center justify-center"
                                style={{
                                  backgroundColor: 'var(--accent-primary)',
                                  boxShadow: '0 0 8px var(--accent-glow)'
                                }}
                              >
                                <div className="w-1 h-1 rounded-full bg-black/60" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Expandable Dropdown Menu Details */}
                    {isExpanded && (
                      <div 
                        className="pt-2 border-t border-white/5 space-y-2.5 font-sans animate-in fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Timestamp & Meta */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Taken: <strong className="text-slate-200">{pos.enteredAt || pos.date || 'Today'}</strong></span>
                          </span>
                          <span>Timeframe: <strong className="text-slate-200">{pos.timeframe || '1H - 4H'}</strong></span>
                        </div>

                        {/* Stats Matrix: Size, Margin, Notional, Current R */}
                        <div className="grid grid-cols-4 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px]">
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Size</div>
                            <div className="text-white font-bold">{pos.size}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Margin</div>
                            <div className="text-slate-200">${pos.marginUSD}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Notional</div>
                            <div className="text-slate-200">${pos.notionalUSD}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">R-Multiple</div>
                            <div className={`font-bold ${pos.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pos.rMultiple > 0 ? `+${pos.rMultiple}` : pos.rMultiple}R
                            </div>
                          </div>
                        </div>

                        {/* Thesis & Invalidation */}
                        {pos.thesis && (
                          <div className="p-2 rounded-xl bg-black/30 border border-white/5 text-[11px] space-y-1">
                            <div className="text-slate-300">
                              <strong className="text-slate-400">Thesis:</strong> {pos.thesis}
                            </div>
                            {pos.invalidation && (
                              <div className="text-rose-300/80">
                                <strong className="text-rose-400">Invalidation:</strong> {pos.invalidation}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Buttons inside Dropdown */}
                        <div className="flex items-center justify-between pt-1">
                          {isPending && (
                            <button
                              type="button"
                              onClick={(e) => handleFillPendingAtMarket(pos.id, currentPrice, e)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              style={{ backgroundColor: 'var(--accent-primary)' }}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Fill at Market (${currentPrice})</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleDeletePosition(pos.id, e)}
                            className="ml-auto px-2 py-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div 
                className="w-10 h-10 rounded-2xl border flex items-center justify-center mx-auto"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)'
                }}
              >
                <Bot className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="text-sm font-bold text-white">No Tracked Trades</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Select trade setups in the War Room to forward test.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* 4. Sub-Tab 2: Trade History */}
      {activeSubTab === 'history' && (
        <div className="space-y-2">
          {paperHistory.length > 0 ? (
            paperHistory.map((trade) => {
              const isWin = trade.isWin || trade.pnlUSD >= 0;
              const isExpanded = expandedTradeId === trade.id;

              return (
                <GlassCard 
                  key={trade.id} 
                  hoverEffect={false} 
                  className={`p-3 text-xs font-mono transition-all cursor-pointer border ${
                    isExpanded ? 'border-white/20 bg-white/[0.04]' : 'border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isWin ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                      }`}>
                        {trade.ticker}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{trade.side}</span>
                          <span className="text-slate-300">${trade.entryPrice} ➔ ${trade.exitPrice}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {trade.exitReason}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-sans">
                          {trade.closedAt ? `${new Date(trade.closedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Recent'} • {trade.strategy || 'Discretionary'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-right">
                      <div>
                        <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ROE: {trade.roePct > 0 ? `+${trade.roePct}` : trade.roePct}%
                        </div>
                      </div>

                      <div className="p-1 text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expandable History Dropdown */}
                  {isExpanded && (
                    <div 
                      className="pt-2.5 mt-2 border-t border-white/5 space-y-2 font-sans animate-in fade-in duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-center">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Entry Price</div>
                          <div className="text-white font-bold">${trade.entryPrice}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Exit Price</div>
                          <div className="text-white font-bold">${trade.exitPrice}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Realized PnL</div>
                          <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
                        <span>Closed: <strong className="text-slate-300">{new Date(trade.closedAt).toLocaleString()}</strong></span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteHistory(trade.id, e)}
                          className="px-2 py-0.5 rounded text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors cursor-pointer"
                        >
                          Delete Record
                        </button>
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div 
                className="w-10 h-10 rounded-2xl border flex items-center justify-center mx-auto"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)'
                }}
              >
                <Layers className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="text-sm font-bold text-white">No Completed Trades</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Completed trades will be recorded here automatically.
              </p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};

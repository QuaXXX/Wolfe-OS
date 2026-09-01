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
  Zap
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
  soundEnabled = true
}) => {
  const [account, setAccount] = useState(getPaperAccount());
  const [paperPositions, setPaperPositions] = useState(getPaperPositions());
  const [paperHistory, setPaperHistory] = useState(getPaperTradeHistory());
  const [activeSubTab, setActiveSubTab] = useState('open'); // 'open' | 'history'

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
    if (window.confirm("Reset Hermes Forward-Test Paper Account back to $10,000.00?")) {
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
      <GlassCard hoverEffect={false} className="p-4 space-y-3">
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl border flex items-center justify-center"
              style={{ 
                backgroundColor: 'var(--accent-subtle)',
                borderColor: 'var(--accent-border)'
              }}
            >
              <Bot className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Forward-Test Paper Desk
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Individual Selection Active</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                100% Exchange Clearinghouse Math • 5x Leverage ROE Tracking
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAccount}
              title="Reset paper account"
              className="p-1.5 rounded-xl bg-white/[0.02] hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 border border-white/5 cursor-pointer transition-all flex items-center gap-1 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Desk</span>
            </button>
          </div>
        </div>

        {/* Account Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[9px] text-slate-400 uppercase font-sans">Paper Balance</div>
            <div className="text-sm font-bold text-white mt-0.5">
              ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[9px] text-slate-400 uppercase font-sans">Realized P&L</div>
            <div className={`text-sm font-bold mt-0.5 ${account.realizedPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {account.realizedPnlUSD >= 0 ? `+$${account.realizedPnlUSD.toFixed(2)}` : `-$${Math.abs(account.realizedPnlUSD).toFixed(2)}`}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[9px] text-slate-400 uppercase font-sans">Win Rate</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {winRate}% <span className="text-[10px] text-slate-400 font-normal">({account.winningTrades}W / {account.losingTrades}L)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[9px] text-slate-400 uppercase font-sans">Unrealized P&L</div>
            <div className={`text-sm font-bold mt-0.5 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnl >= 0 ? `+$${totalUnrealizedPnl.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnl).toFixed(2)}`}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 2. Sub-Tabs */}
      <div 
        className="flex items-center gap-2 border-b pb-1"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('open')}
          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'open'
              ? 'text-white'
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
              ? 'text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          style={activeSubTab === 'history' ? { 
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent-primary)'
          } : {}}
        >
          Completed History ({paperHistory.length})
        </button>
      </div>

      {/* 3. Sub-Tab 1: Live Positions */}
      {activeSubTab === 'open' && (
        <div className="space-y-2">
          {paperPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paperPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const isPending = pos.status === 'PENDING_ENTRY';
                const currentPrice = pos.currentPrice || pos.entryPrice;
                const isProfitable = (pos.unrealizedPnlUSD || 0) >= 0;

                // Progress towards TP vs SL
                const totalRange = Math.abs(pos.takeProfit - pos.stopLoss);
                const distanceCovered = isLong ? (currentPrice - pos.stopLoss) : (pos.stopLoss - currentPrice);
                const progressPct = Math.max(0, Math.min(100, (distanceCovered / totalRange) * 100));

                // Price distance from Entry for pending orders
                const distanceToEntryPct = pos.entryPrice > 0 
                  ? (((currentPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2)
                  : '0.00';

                return (
                  <GlassCard key={pos.id} hoverEffect={false} className="p-3.5 space-y-2.5 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                        }`}>
                          {pos.side} {pos.leverage}x
                        </span>

                        {isPending ? (
                          <span 
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse"
                          >
                            <Hourglass className="w-3 h-3 text-amber-400" />
                            <span>Waiting for Entry Trigger</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Active in Market</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isPending ? (
                          <div className="text-right font-mono">
                            <div className={`text-xs font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfitable ? `+$${(pos.unrealizedPnlUSD || 0).toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnlUSD || 0).toFixed(2)}`}
                            </div>
                            <div className="text-[10px] text-slate-300">
                              ROE: <strong className={isProfitable ? 'text-emerald-400' : 'text-rose-400'}>{pos.roePct > 0 ? `+${pos.roePct}` : pos.roePct}%</strong> <span className="text-slate-400">({pos.spotMovePct > 0 ? `+${pos.spotMovePct}` : pos.spotMovePct}% Spot × {pos.leverage}x)</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-right font-mono">
                            <div className="text-xs font-bold text-slate-400">$0.00 PnL</div>
                            <div className="text-[10px] text-amber-300/90 font-sans">Resting Limit Order</div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleDeletePosition(pos.id, e)}
                          title="Remove trade"
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/[0.04] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Pending Entry Highlight Banner */}
                    {isPending && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5 font-mono">
                        <div className="flex items-center justify-between text-xs text-amber-200">
                          <span className="font-bold flex items-center gap-1">
                            <Hourglass className="w-3.5 h-3.5 text-amber-400" />
                            <span>Resting Limit Order: <strong>${pos.entryPrice}</strong></span>
                          </span>
                          <span className="text-[11px] text-slate-300">Live Market: <strong className="text-white">${currentPrice}</strong> ({Number(distanceToEntryPct) > 0 ? `+${distanceToEntryPct}` : distanceToEntryPct}%)</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-amber-500/15">
                          <span>Order unfilled • Zero risk until filled</span>
                          <button
                            type="button"
                            onClick={(e) => handleFillPendingAtMarket(pos.id, currentPrice, e)}
                            className="px-2 py-0.5 rounded-md font-bold text-white flex items-center gap-1 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          >
                            <Zap className="w-3 h-3" />
                            <span>Fill at Market Now (${currentPrice})</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Stats Matrix: Size, Margin, Notional, Current R */}
                    <div className="grid grid-cols-4 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px]">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Size</div>
                        <div className="text-white font-bold">{pos.size}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Margin (5x)</div>
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

                    {/* Timeframe & Trade Duration */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-sans">
                      <Clock className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                      <span><strong>Timeframe:</strong> <span className="text-white">{pos.timeframe || '1H - 4H Intraday'}</span></span>
                      <span>•</span>
                      <span>{pos.expectedDuration || '3 - 8h'}</span>
                    </div>

                    {/* Entry, Stop Loss, 2R Take Profit Matrix */}
                    <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px]">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Entry Trigger</div>
                        <div className="text-white font-bold">${pos.entryPrice}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-rose-400 uppercase">Stop Loss</div>
                        <div className="text-rose-300 font-bold">${pos.stopLoss}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-emerald-400 uppercase">2R Target</div>
                        <div className="text-emerald-300 font-bold">${pos.takeProfit}</div>
                      </div>
                    </div>

                    {/* Live Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span className="text-rose-400">SL: ${pos.stopLoss}</span>
                        <span className="text-white font-bold">Current: ${currentPrice}</span>
                        <span className="text-emerald-400">TP: ${pos.takeProfit}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-rose-500/20 overflow-hidden relative">
                        <div 
                          className="h-full bg-emerald-400 transition-all duration-500 rounded-full"
                          style={{ width: `${isPending ? 0 : progressPct}%` }}
                        />
                      </div>
                    </div>
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
              <div className="text-sm font-bold text-white">No Tracked Trades Yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Review the candidate plays in the Morning War Room and tap <strong>"+ Forward-Test"</strong> on any individual setup you'd like to test!
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
              return (
                <GlassCard key={trade.id} hoverEffect={false} className="p-3 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
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
                        {new Date(trade.closedAt).toLocaleString()} • {trade.strategy}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ROE: {trade.roePct > 0 ? `+${trade.roePct}` : trade.roePct}%
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteHistory(trade.id, e)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
              <div className="text-sm font-bold text-white">No Completed Trades Yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When active forward-test trades hit their 2R Take-Profit or Stop Loss targets, they will appear here.
              </p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};

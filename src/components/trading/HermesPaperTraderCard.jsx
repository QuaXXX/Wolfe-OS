import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  ShieldAlert, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  Layers,
  Sparkles,
  Zap
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { 
  getPaperAccount, 
  savePaperAccount, 
  getPaperPositions, 
  getPaperTradeHistory, 
  resetPaperTradingAccount, 
  autoExecuteHermesPlays 
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

  const handleToggleAutoTrader = () => {
    playSound('click', soundEnabled);
    const updated = savePaperAccount({
      ...account,
      isAutoTradingEnabled: !account.isAutoTradingEnabled
    });
    setAccount(updated);
  };

  const handleForceExecuteToday = () => {
    playSound('click', soundEnabled);
    if (latestBrief) {
      const created = autoExecuteHermesPlays(latestBrief, true);
      refreshState();
      if (onPositionChanged) onPositionChanged();
      playSound('success', soundEnabled);
    }
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

  const totalUnrealizedPnl = paperPositions.reduce((acc, pos) => acc + (pos.unrealizedPnlUSD || 0), 0);

  return (
    <div className="space-y-3 font-sans">
      {/* 1. Header & Performance Metrics HUD */}
      <GlassCard hoverEffect={false} className="p-4 space-y-3 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] via-black/40 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Hermes Forward-Test Engine (Live Paper Desk)
                </h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  account.isAutoTradingEnabled 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${account.isAutoTradingEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{account.isAutoTradingEnabled ? 'Auto-Execute Active' : 'Paused'}</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Automatically enters all high-conviction plays and evaluates live TP/SL hits in real-time.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAutoTrader}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                account.isAutoTradingEnabled
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/10'
              }`}
            >
              {account.isAutoTradingEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{account.isAutoTradingEnabled ? 'Pause Auto-Trader' : 'Resume Auto-Trader'}</span>
            </button>

            <button
              type="button"
              onClick={handleForceExecuteToday}
              title="Force enter current morning brief plays into paper trader"
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Enter Plays Now</span>
            </button>

            <button
              type="button"
              onClick={handleResetAccount}
              title="Reset paper account"
              className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/5 cursor-pointer transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
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
            <div className="text-sm font-bold text-amber-300 mt-0.5">
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

      {/* 2. Sub-Tabs: Live Positions vs Trade History */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('open')}
          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'open'
              ? 'bg-white/[0.1] text-white border border-white/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Live Forward-Test Positions ({paperPositions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-white/[0.1] text-white border border-white/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Forward-Test History ({paperHistory.length})
        </button>
      </div>

      {/* 3. Sub-Tab 1: Live Positions with Real-Time TP/SL Proximity */}
      {activeSubTab === 'open' && (
        <div className="space-y-2">
          {paperPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paperPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const currentPrice = pos.currentPrice || pos.entryPrice;
                const isProfitable = (pos.unrealizedPnlUSD || 0) >= 0;

                // Calculate progress % towards Take Profit vs Stop Loss
                const totalRange = Math.abs(pos.takeProfit - pos.stopLoss);
                const distanceCovered = isLong ? (currentPrice - pos.stopLoss) : (pos.stopLoss - currentPrice);
                const progressPct = Math.max(0, Math.min(100, (distanceCovered / totalRange) * 100));

                return (
                  <GlassCard key={pos.id} hoverEffect={false} className="p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {pos.side} {pos.leverage}x
                        </span>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">Grade: {pos.convictionGrade}</span>
                      </div>

                      <div className="text-right font-mono">
                        <div className={`text-xs font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfitable ? `+$${(pos.unrealizedPnlUSD || 0).toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnlUSD || 0).toFixed(2)}`}
                        </div>
                        <span className="text-[10px] text-slate-400">({pos.unrealizedRoiPct || 0}%)</span>
                      </div>
                    </div>

                    {/* Entry, Stop Loss, 2R Take Profit Matrix */}
                    <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px]">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Entry</div>
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

                    {/* Real-time Distance to TP / SL Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span className="text-rose-400">SL: ${pos.stopLoss}</span>
                        <span className="text-white font-bold">Current: ${currentPrice}</span>
                        <span className="text-emerald-400">TP: ${pos.takeProfit}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-rose-500/20 overflow-hidden relative">
                        <div 
                          className="h-full bg-emerald-400 transition-all duration-500 rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1">
              <div className="text-xs font-bold text-white">No Active Forward-Test Trades</div>
              <p className="text-[11px] text-slate-400">
                Click "Enter Plays Now" or wait for tomorrow's morning brief to auto-enter all high-conviction plays.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. Sub-Tab 2: History Ledger */}
      {activeSubTab === 'history' && (
        <div className="space-y-2">
          {paperHistory.length > 0 ? (
            <div className="space-y-1.5">
              {paperHistory.map((trade) => {
                const isWin = trade.isWin || trade.pnlUSD >= 0;
                return (
                  <div 
                    key={trade.id}
                    className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2.5">
                      {isWin ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{trade.ticker} {trade.side}</span>
                          <span className="text-[10px] text-slate-400">${trade.entryPrice} ➔ ${trade.exitPrice}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans">{trade.exitReason}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                      </div>
                      <span className="text-[10px] text-slate-400">{trade.roiPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-400">
              No forward-test trades completed yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

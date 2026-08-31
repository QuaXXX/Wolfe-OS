import React, { useState } from 'react';
import { 
  TrendingUp, 
  Calculator,
  Plus,
  LineChart
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';

export const TradingView = ({ 
  tradingData, 
  onOpenComingSoon, 
  soundEnabled = true 
}) => {
  const watchlist = tradingData.watchlist || [];
  const todayTrades = tradingData.todayTrades || [];
  const [selectedStock, setSelectedStock] = useState(watchlist[0] || null);
  
  // Calculator State
  const [accountSize, setAccountSize] = useState(25000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(selectedStock?.price || 100.00);
  const [stopLoss, setStopLoss] = useState(Number(((selectedStock?.price || 100.00) * 0.98).toFixed(2)));

  // Calculations
  const riskAmount = (accountSize * (riskPercent / 100));
  const riskPerShare = Math.max(0.01, entryPrice - stopLoss);
  const shareSize = Math.floor(riskAmount / riskPerShare);
  const totalPositionCost = shareSize * entryPrice;
  const targetPrice2R = entryPrice + (riskPerShare * 2);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <TrendingUp className="w-4 h-4" />
            <span>Day Trading & Capital Execution</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Trades & Market Watchlist
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.03] text-right" style={{ border: '1px solid var(--accent-border)' }}>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Today's Realized P&L</div>
            <div className="text-xl font-mono font-bold text-white">
              ${(tradingData.dayPnl || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] font-mono" style={{ color: 'var(--accent-primary)' }}>
              {tradingData.dayPnlPercent || 0}% • Win Rate {tradingData.winRate || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Market Watchlist ({watchlist.length})
          </h2>
        </div>

        {watchlist.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {watchlist.map((stock) => {
              const isSelected = selectedStock?.symbol === stock.symbol;
              return (
                <GlassCard
                  key={stock.symbol}
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedStock(stock);
                    setEntryPrice(stock.price);
                    setStopLoss(Number((stock.price * 0.98).toFixed(2)));
                  }}
                  className={`p-3 cursor-pointer transition-all ${
                    isSelected 
                      ? 'ring-1 bg-[#14182a]' 
                      : 'hover:bg-white/[0.04]'
                  }`}
                  style={isSelected ? { borderColor: 'var(--accent-primary)' } : {}}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs font-mono">{stock.symbol}</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: 'var(--accent-primary)' }}>
                      {stock.change}
                    </span>
                  </div>

                  <div className="font-mono text-sm font-bold text-slate-100 mt-0.5">
                    ${stock.price?.toFixed(2)}
                  </div>

                  <div className="h-4 w-full mt-1.5">
                    <svg className="w-full h-full" viewBox="0 0 100 24">
                      <polyline
                        fill="none"
                        stroke="var(--accent-primary)"
                        strokeWidth="1.5"
                        points="0,20 20,16 40,18 60,8 80,12 100,4"
                      />
                    </svg>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard hoverEffect={false} className="p-6 text-center space-y-2">
            <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <LineChart className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">Watchlist Empty</div>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              No stock tickers are being tracked. You can log trades and positions directly via voice or Wolfe AI.
            </p>
          </GlassCard>
        )}
      </div>

      {/* Position Sizer + Executed Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Risk Sizer */}
        <div className="space-y-4">
          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Position Sizer</h3>
              </div>
              <span className="text-[10px] font-mono font-semibold uppercase" style={{ color: 'var(--accent-primary)' }}>1:2 R/R</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Portfolio Capital ($)</label>
                <input
                  type="number"
                  value={accountSize}
                  onChange={(e) => setAccountSize(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono outline-none focus:border-white/30"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Risk: <strong className="text-white font-mono">{riskPercent}%</strong></span>
                  <span className="font-mono text-slate-200">${riskAmount.toFixed(2)} Risk</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.25"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Entry ($)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Stop ($)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono outline-none focus:border-white/30"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Position Size:</span>
                <span className="font-mono font-bold text-white">{shareSize} Shares</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Committed Capital:</span>
                <span className="font-mono text-slate-200">${totalPositionCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-white/5">
                <span className="text-slate-300 font-semibold">2R Target Price:</span>
                <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>${targetPrice2R.toFixed(2)}</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Executed Trades */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div>
                <span className="text-xs font-mono font-semibold uppercase" style={{ color: 'var(--accent-primary)' }}>Journal</span>
                <h3 className="text-sm font-bold text-white">Executed Trades Today ({todayTrades.length})</h3>
              </div>
            </div>

            {todayTrades.length > 0 ? (
              <div className="space-y-2">
                {todayTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center font-mono font-bold text-xs"
                        style={{ color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                      >
                        {trade.ticker}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{trade.type}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            {trade.entry} → {trade.exit}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">{trade.strategy}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 text-right">
                      <div>
                        <div className="font-mono font-bold text-white">
                          {trade.pnl}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{trade.pnlPercent}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-400">
                No trades logged today. Position sizing and journal entries will appear here once executed.
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

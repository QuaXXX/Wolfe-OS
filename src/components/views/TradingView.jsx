import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calculator, 
  Plus, 
  LineChart, 
  Sparkles, 
  Radio, 
  Key, 
  BookOpen, 
  Trash2, 
  ExternalLink, 
  Layers, 
  ShieldCheck, 
  Target, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { HermesWarRoomModal } from '../trading/HermesWarRoomModal';
import { HyperliquidConnectModal } from '../trading/HyperliquidConnectModal';
import { WebhookConfigModal } from '../trading/WebhookConfigModal';
import { TradeJournalModal } from '../trading/TradeJournalModal';
import { 
  getTradingConfig, 
  getWatchlist, 
  addWatchlistTicker, 
  removeWatchlistTicker, 
  getOpenPositions, 
  closePositionRecord, 
  getTradeJournal, 
  deleteJournalTrade, 
  calculateTradingStats, 
  getWebhookLogs, 
  getLatestHermesBrief 
} from '../../utils/tradingStorage';
import { calculateDynamicPositionSize, fetchHyperliquidAccount, fetchLiveMarketPrices } from '../../utils/hyperliquidService';
import { runHermesSwarmAnalysis } from '../../utils/hermesSwarmService';
import { playSound } from '../../utils/soundFX';

export const TradingView = ({ 
  tradingData, 
  soundEnabled = true 
}) => {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'positions' | 'journal' | 'webhooks'

  // Data States
  const [config, setConfig] = useState(getTradingConfig());
  const [watchlist, setWatchlist] = useState(getWatchlist());
  const [openPositions, setOpenPositions] = useState(getOpenPositions());
  const [tradeJournal, setTradeJournal] = useState(getTradeJournal());
  const [webhookLogs, setWebhookLogs] = useState(getWebhookLogs());
  const [hermesBrief, setHermesBrief] = useState(getLatestHermesBrief());
  const [selectedStock, setSelectedStock] = useState(watchlist[0] || null);

  // Modals
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isHyperliquidOpen, setIsHyperliquidOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [selectedTradeForEdit, setSelectedTradeForEdit] = useState(null);

  // New Ticker input
  const [newTickerInput, setNewTickerInput] = useState('');
  const [isAddingTicker, setIsAddingTicker] = useState(false);

  // Interactive Position Sizer State
  const [accountSize, setAccountSize] = useState(config.accountEquity || 10000);
  const [riskPercent, setRiskPercent] = useState(config.defaultRiskPercent || 1.5);
  const [entryPrice, setEntryPrice] = useState(selectedStock?.price || 100.61);
  const [stopLoss, setStopLoss] = useState(Number(((selectedStock?.price || 100.61) * 0.985).toFixed(2)));
  const [leverage, setLeverage] = useState(config.maxLeverage || 5);

  useEffect(() => {
    refreshAllData();

    // 1. Fetch live market prices immediately and poll every 10s
    const updatePrices = async () => {
      try {
        const livePrices = await fetchLiveMarketPrices();
        if (livePrices && Object.keys(livePrices).length > 0) {
          setWatchlist(prev => prev.map(item => {
            const symbol = item.symbol.toUpperCase();
            if (livePrices[symbol]) {
              const newPrice = livePrices[symbol];
              return {
                ...item,
                price: newPrice
              };
            }
            return item;
          }));
        }
      } catch (err) {}
    };

    updatePrices();
    const interval = setInterval(updatePrices, 10000);

    // 2. Auto-generate initial Hermes brief if none exists
    if (!hermesBrief) {
      runHermesSwarmAnalysis().then(b => setHermesBrief(b));
    }

    return () => clearInterval(interval);
  }, []);

  const refreshAllData = () => {
    setConfig(getTradingConfig());
    setWatchlist(getWatchlist());
    setOpenPositions(getOpenPositions());
    setTradeJournal(getTradeJournal());
    setWebhookLogs(getWebhookLogs());
    setHermesBrief(getLatestHermesBrief());
  };

  // Performance Stats Calculation
  const stats = useMemo(() => calculateTradingStats(), [tradeJournal]);

  // Dynamic Sizing Result
  const sizingResult = useMemo(() => {
    return calculateDynamicPositionSize({
      accountEquity: accountSize,
      riskPercent,
      entryPrice,
      stopLossPrice: stopLoss,
      leverage,
      asset: selectedStock?.symbol || 'BTC'
    });
  }, [accountSize, riskPercent, entryPrice, stopLoss, leverage, selectedStock]);

  const handleSelectTicker = (stock) => {
    playSound('click', soundEnabled);
    setSelectedStock(stock);
    setEntryPrice(stock.price);
    setStopLoss(Number((stock.price * 0.985).toFixed(2)));
  };

  const handleAddTicker = (e) => {
    if (e) e.preventDefault();
    if (!newTickerInput.trim()) return;
    playSound('click', soundEnabled);
    const updated = addWatchlistTicker({
      symbol: newTickerInput.trim().toUpperCase(),
      name: `${newTickerInput.trim().toUpperCase()} Asset`,
      price: 100.00,
      change: '+0.00%'
    });
    setWatchlist(updated);
    setNewTickerInput('');
    setIsAddingTicker(false);
  };

  const handleRemoveTicker = (symbol, e) => {
    e.stopPropagation();
    playSound('click', soundEnabled);
    const updated = removeWatchlistTicker(symbol);
    setWatchlist(updated);
    if (selectedStock?.symbol === symbol) setSelectedStock(updated[0] || null);
  };

  const handleClosePosition = (posId) => {
    playSound('click', soundEnabled);
    closePositionRecord(posId);
    refreshAllData();
  };

  const handleDeleteTrade = (tradeId, e) => {
    e.stopPropagation();
    playSound('click', soundEnabled);
    deleteJournalTrade(tradeId);
    refreshAllData();
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24 select-none">
      {/* 1. TOP COMMAND HUD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <TrendingUp className="w-4 h-4" />
            <span>Autonomous Trading Desk & Execution Hub</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Institutional Command & Webhook Engine
          </h1>
        </div>

        {/* Action Buttons & Realized P&L */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Hermes War Room Button */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWarRoomOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Hermes Council</span>
          </button>

          {/* Webhook Bridge */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWebhookModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Webhooks</span>
          </button>

          {/* Hyperliquid Bridge Status */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsHyperliquidOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Key className="w-3.5 h-3.5 text-blue-400" />
            <span>Hyperliquid</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>

          {/* Realized PnL Card */}
          <div className="px-3.5 py-1 rounded-xl bg-white/[0.03] text-right border border-white/10 min-w-[130px]">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Total P&L</div>
            <div className={`text-base font-mono font-bold ${stats.totalPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnlUSD >= 0 ? `+$${stats.totalPnlUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `-$${Math.abs(stats.totalPnlUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Win Rate: <strong className="text-white">{stats.winRate}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-white/5">
        {[
          { id: 'overview', label: '🌅 Morning War Room & Setups', icon: Compass },
          { id: 'positions', label: `💼 Live Positions (${openPositions.length})`, icon: Layers },
          { id: 'journal', label: `📖 Trade Journal (${tradeJournal.length})`, icon: BookOpen },
          { id: 'webhooks', label: `⚡ Webhook Logs (${webhookLogs.length})`, icon: Radio }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab(tab.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'bg-white/[0.1] text-white border border-white/20 shadow-sm'
                  : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.04]'
              }`}
              style={isActive ? { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' } : {}}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB 1: MORNING WAR ROOM & HERMES OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Macro Banner */}
          {hermesBrief && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-blue-300 font-bold">
                    Overnight Macro Synthesis
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Skeptic Approved
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-400">{hermesBrief.date}</span>
              </div>
              <h2 className="text-sm font-bold text-white">{hermesBrief.macroRegime}</h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">{hermesBrief.macroAnalysis}</p>
            </div>
          )}

          {/* High Conviction Play Cards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>Today's High Conviction Playbook</span>
              </div>
              <button
                type="button"
                onClick={() => setIsWarRoomOpen(true)}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Agent Logs</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(hermesBrief?.highConvictionPlays || []).map((play, idx) => {
                const isLong = play.bias === 'LONG';
                return (
                  <GlassCard key={idx} hoverEffect={false} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white font-mono">{play.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                          isLong ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {play.bias}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-300">Grade: {play.convictionGrade}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Trigger</div>
                        <div className="font-bold text-white truncate">{play.entryTrigger.split(' ')[0]}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-rose-400 uppercase">Stop Loss</div>
                        <div className="font-bold text-rose-300">{play.stopLoss}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-emerald-400 uppercase">2R Target</div>
                        <div className="font-bold text-emerald-300">{play.target2R}</div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      <strong className="text-slate-400">Thesis:</strong> {play.thesis}
                    </p>

                    <div className="text-[11px] text-rose-300/90 pt-1 border-t border-white/5 font-sans">
                      <strong>Invalidation:</strong> {play.invalidation}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>

          {/* Watchlist & Position Sizer Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            {/* Watchlist */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Tracked Assets ({watchlist.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setIsAddingTicker(prev => !prev)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Ticker</span>
                </button>
              </div>

              {/* Add Ticker Input */}
              {isAddingTicker && (
                <form onSubmit={handleAddTicker} className="flex gap-2 p-2 rounded-2xl bg-black/40 border border-white/10">
                  <input
                    type="text"
                    value={newTickerInput}
                    onChange={(e) => setNewTickerInput(e.target.value)}
                    placeholder="Ticker Symbol (e.g. SUI, AVAX, TSLA)..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-white font-mono text-xs outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    Add
                  </button>
                </form>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {watchlist.map((stock) => {
                  const isSelected = selectedStock?.symbol === stock.symbol;
                  return (
                    <GlassCard
                      key={stock.symbol}
                      onClick={() => handleSelectTicker(stock)}
                      className={`p-3 cursor-pointer transition-all ${
                        isSelected ? 'ring-1 bg-[#14182a]' : 'hover:bg-white/[0.04]'
                      }`}
                      style={isSelected ? { borderColor: 'var(--accent-primary)' } : {}}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs font-mono">{stock.symbol}</span>
                        <span className={`text-[10px] font-mono font-semibold ${
                          stock.isPositive !== false ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {stock.change}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-slate-100 mt-0.5">
                        ${stock.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Position Sizer */}
            <div className="space-y-2">
              <GlassCard hoverEffect={false} className="p-4 space-y-3 font-sans">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-amber-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                      Dynamic Risk Sizer
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-amber-300">
                    {selectedStock?.symbol || 'BTC'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Account Equity ($)</label>
                    <input
                      type="number"
                      value={accountSize}
                      onChange={(e) => setAccountSize(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Risk: <strong className="text-white font-mono">{riskPercent}%</strong></span>
                      <span className="font-mono text-amber-300">${sizingResult.riskUSD} Risk</span>
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
                      <label className="text-[10px] text-slate-400 block mb-1">Entry ($)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Stop ($)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Position Size:</span>
                    <span className="font-bold text-white">{sizingResult.contracts} {sizingResult.asset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Notional Value:</span>
                    <span className="text-slate-200">${sizingResult.notionalValueUSD}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Margin Required ({leverage}x):</span>
                    <span className="text-slate-200">${sizingResult.requiredMarginUSD}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-white/5">
                    <span className="text-emerald-400">2R Take Profit:</span>
                    <span className="font-bold text-emerald-300">${sizingResult.targetPrice2R}</span>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: LIVE OPEN POSITIONS */}
      {activeTab === 'positions' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Active Hyperliquid Positions ({openPositions.length})
            </h3>
          </div>

          {openPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {openPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                return (
                  <GlassCard key={pos.id} hoverEffect={false} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {pos.side} {pos.leverage}x
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClosePosition(pos.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer transition-all"
                      >
                        Market Close
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Size</div>
                        <div className="font-bold text-white">{pos.size}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Entry Price</div>
                        <div className="text-slate-200">${pos.entryPrice}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-400 uppercase">Stop Loss</div>
                        <div className="text-rose-300">${pos.stopLoss || 'None'}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono pt-1 text-slate-400">
                      <span>Strategy: {pos.strategy}</span>
                      <span className="text-[10px] text-emerald-400">24/7 Cloud Synced</span>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <Layers className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-white">No Open Positions</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Incoming TradingView webhooks or manual executions will show live here.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* 5. TAB 3: TRADE JOURNAL */}
      {activeTab === 'journal' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Completed Trade History & AI Reviews ({tradeJournal.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setSelectedTradeForEdit(null);
                setIsJournalModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Trade Manually</span>
            </button>
          </div>

          {tradeJournal.length > 0 ? (
            <div className="space-y-2">
              {tradeJournal.map((trade) => {
                const isWin = trade.pnlUSD >= 0;
                return (
                  <div
                    key={trade.id}
                    className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                        isWin ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                      }`}>
                        {trade.ticker}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-white">{trade.side}</span>
                          <span className="text-slate-400 text-[11px]">${trade.entryPrice} ➔ ${trade.exitPrice}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{trade.strategy}</div>
                      </div>
                    </div>

                    {/* AI Post-Mortem Quote */}
                    {trade.aiPostMortem && (
                      <div className="flex-1 max-w-md text-[11px] text-slate-300 italic truncate hidden lg:block">
                        "{trade.aiPostMortem}"
                      </div>
                    )}

                    <div className="flex items-center justify-between sm:justify-end gap-3 text-right">
                      <div>
                        <div className={`font-mono font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{trade.returnPct}%</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTrade(trade.id, e)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-white">Trade Journal Empty</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Closed positions and manual trades will be logged here with automatic AI post-mortems.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* 6. TAB 4: WEBHOOK LOGS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              TradingView Webhook Execution Signals ({webhookLogs.length})
            </h3>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer font-semibold"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Configure Alerts & Payloads</span>
            </button>
          </div>

          {webhookLogs.length > 0 ? (
            <div className="space-y-2">
              {webhookLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-white">{log.action} {log.ticker}</span>
                      <span className="text-slate-400 ml-2">@ ${log.price}</span>
                      <div className="text-[10px] text-slate-500 font-sans">{log.strategy} • {new Date(log.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <Radio className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-white">No Webhooks Received Yet</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Open the Webhook Modal to copy your TradingView JSON payload and simulate test signals.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* ACTIVE MODALS */}
      <HermesWarRoomModal
        isOpen={isWarRoomOpen}
        onClose={() => {
          setIsWarRoomOpen(false);
          refreshAllData();
        }}
        initialBrief={hermesBrief}
        onBriefUpdated={(b) => setHermesBrief(b)}
        soundEnabled={soundEnabled}
      />

      <HyperliquidConnectModal
        isOpen={isHyperliquidOpen}
        onClose={() => {
          setIsHyperliquidOpen(false);
          refreshAllData();
        }}
        onConfigSaved={(cfg) => setConfig(cfg)}
        soundEnabled={soundEnabled}
      />

      <WebhookConfigModal
        isOpen={isWebhookModalOpen}
        onClose={() => {
          setIsWebhookModalOpen(false);
          refreshAllData();
        }}
        onSignalExecuted={() => refreshAllData()}
        soundEnabled={soundEnabled}
      />

      <TradeJournalModal
        isOpen={isJournalModalOpen}
        onClose={() => {
          setIsJournalModalOpen(false);
          refreshAllData();
        }}
        initialTrade={selectedTradeForEdit}
        onTradeSaved={() => refreshAllData()}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};

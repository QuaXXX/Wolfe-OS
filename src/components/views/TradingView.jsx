import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Sparkles, 
  Radio, 
  Key, 
  BookOpen, 
  Trash2, 
  Layers, 
  Target, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2,
  Bot,
  Clock,
  Zap,
  Check
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { HermesWarRoomModal } from '../trading/HermesWarRoomModal';
import { HyperliquidConnectModal } from '../trading/HyperliquidConnectModal';
import { WebhookConfigModal } from '../trading/WebhookConfigModal';
import { TradeJournalModal } from '../trading/TradeJournalModal';
import { HermesPaperTraderCard } from '../trading/HermesPaperTraderCard';
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
import { fetchHyperliquidAccount, fetchLiveMarketPrices } from '../../utils/hyperliquidService';
import { runHermesSwarmAnalysis } from '../../utils/hermesSwarmService';
import { 
  tickPaperPositionsWithLivePrices, 
  autoExecuteHermesPlays, 
  enterSingleHermesPlay,
  getPaperPositions 
} from '../../utils/hermesPaperTrader';
import { playSound } from '../../utils/soundFX';

export const TradingView = ({ 
  tradingData, 
  soundEnabled = true 
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'papertrader' | 'positions' | 'journal' | 'webhooks'

  // Data States
  const [config, setConfig] = useState(getTradingConfig());
  const [watchlist, setWatchlist] = useState(getWatchlist());
  const [openPositions, setOpenPositions] = useState(getOpenPositions());
  const [paperPositions, setPaperPositions] = useState(getPaperPositions());
  const [tradeJournal, setTradeJournal] = useState(getTradeJournal());
  const [webhookLogs, setWebhookLogs] = useState(getWebhookLogs());
  const [hermesBrief, setHermesBrief] = useState(getLatestHermesBrief());
  const [livePricesMap, setLivePricesMap] = useState({});

  // Modals
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isHyperliquidOpen, setIsHyperliquidOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [selectedTradeForEdit, setSelectedTradeForEdit] = useState(null);

  // New Ticker input
  const [newTickerInput, setNewTickerInput] = useState('');
  const [isAddingTicker, setIsAddingTicker] = useState(false);

  useEffect(() => {
    refreshAllData();

    // 1. Fetch live market prices immediately and poll every 10s
    const updatePrices = async () => {
      try {
        const livePrices = await fetchLiveMarketPrices();
        if (livePrices && Object.keys(livePrices).length > 0) {
          setLivePricesMap(livePrices);

          // Real-Time TP / SL Trigger Engine
          const tickResult = tickPaperPositionsWithLivePrices(livePrices);
          if (tickResult.closedTrades && tickResult.closedTrades.length > 0) {
            playSound('success', soundEnabled);
            refreshAllData();
          }

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
      runHermesSwarmAnalysis().then(b => {
        setHermesBrief(b);
        autoExecuteHermesPlays(b);
        setPaperPositions(getPaperPositions());
      });
    }

    return () => clearInterval(interval);
  }, []);

  const refreshAllData = () => {
    setConfig(getTradingConfig());
    setWatchlist(getWatchlist());
    setOpenPositions(getOpenPositions());
    setPaperPositions(getPaperPositions());
    setTradeJournal(getTradeJournal());
    setWebhookLogs(getWebhookLogs());
    setHermesBrief(getLatestHermesBrief());
  };

  const stats = useMemo(() => calculateTradingStats(), [tradeJournal]);

  const handleEnterIndividualPlay = (play) => {
    playSound('click', soundEnabled);
    enterSingleHermesPlay(play, hermesBrief?.date, livePricesMap);
    setPaperPositions(getPaperPositions());
    playSound('success', soundEnabled);
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
    <div className="space-y-4 max-w-6xl mx-auto pb-24 select-none font-sans">
      {/* 1. INSTITUTIONAL TOP COMMAND BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Institutional Trading Desk</span>
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight mt-0.5">
            Command Center & Forward-Test Engine
          </h1>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Hermes Council */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWarRoomOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Hermes Council</span>
          </button>

          {/* Webhooks */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWebhookModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            <span>Webhooks</span>
          </button>

          {/* Hyperliquid Bridge */}
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsHyperliquidOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Key className="w-3.5 h-3.5 text-slate-400" />
            <span>Hyperliquid</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>

          {/* Performance Pill */}
          <div className="px-3 py-1 rounded-xl bg-white/[0.02] text-right border border-white/10 min-w-[110px]">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Realized P&L</div>
            <div className={`text-sm font-mono font-bold ${stats.totalPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnlUSD >= 0 ? `+$${stats.totalPnlUSD.toFixed(2)}` : `-$${Math.abs(stats.totalPnlUSD).toFixed(2)}`}
            </div>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-white/5">
        {[
          { id: 'overview', label: '🌅 Morning War Room', icon: Compass },
          { id: 'papertrader', label: '🤖 Forward-Test Paper Desk', icon: Bot },
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'bg-white/[0.1] text-white border border-white/15 shadow-sm'
                  : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB 1: MORNING WAR ROOM & HIGH CONVICTION SETUPS */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Macro Regime Banner */}
          {hermesBrief && (
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                    Macro Regime Synthesis
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Skeptic Validated
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{hermesBrief.date}</span>
              </div>
              <h2 className="text-xs font-bold text-white">{hermesBrief.macroRegime}</h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">{hermesBrief.macroAnalysis}</p>
            </div>
          )}

          {/* Plays of the Day with Individual Test Buttons */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>Plays of the Day ({hermesBrief?.highConvictionPlays?.length || 4} Setups)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsWarRoomOpen(true)}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <span>Council Logs</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(hermesBrief?.highConvictionPlays || []).map((play, idx) => {
                const isLong = play.bias === 'LONG';
                const isAlreadyTracking = paperPositions.some(p => p.ticker === play.ticker && p.status !== 'CLOSED');

                return (
                  <GlassCard key={idx} hoverEffect={false} className="p-3.5 space-y-2.5 border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white font-mono">{play.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                          isLong ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        }`}>
                          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {play.bias}
                        </span>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">Grade: {play.convictionGrade}</span>
                      </div>

                      {/* Individual Forward-Test Button */}
                      <button
                        type="button"
                        onClick={() => handleEnterIndividualPlay(play)}
                        disabled={isAlreadyTracking}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          isAlreadyTracking
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 opacity-90'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/10 hover:border-white/20'
                        }`}
                      >
                        {isAlreadyTracking ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3 text-amber-400" />}
                        <span>{isAlreadyTracking ? 'In Paper Desk' : 'Forward-Test Play'}</span>
                      </button>
                    </div>

                    {/* Timeframe & Trade Duration */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-slate-200 font-medium">{play.timeframe || '1H - 4H Intraday'}</span>
                      <span>•</span>
                      <span>{play.expectedDuration || '3 - 8 Hours'}</span>
                      {play.optimalWindow && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">{play.optimalWindow}</span>
                        </>
                      )}
                    </div>

                    {/* Entry, Stop Loss, 2R Take Profit Matrix */}
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

          {/* Forward-Test Paper Desk Live Section */}
          <div className="pt-2">
            <HermesPaperTraderCard
              latestBrief={hermesBrief}
              livePrices={livePricesMap}
              onPositionChanged={refreshAllData}
              soundEnabled={soundEnabled}
            />
          </div>

          {/* Clean Real-Time Watchlist */}
          <div className="space-y-2 pt-2">
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

            {isAddingTicker && (
              <form onSubmit={handleAddTicker} className="flex gap-2 p-2 rounded-2xl bg-black/40 border border-white/10">
                <input
                  type="text"
                  value={newTickerInput}
                  onChange={(e) => setNewTickerInput(e.target.value)}
                  placeholder="Ticker Symbol (e.g. SUI, AVAX)..."
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

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {watchlist.map((stock) => (
                <GlassCard key={stock.symbol} hoverEffect={false} className="p-2.5 border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs font-mono">{stock.symbol}</span>
                    <span className="text-[9px] text-emerald-400 font-mono">Live</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-100 mt-0.5">
                    ${stock.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: FORWARD-TEST PAPER DESK */}
      {activeTab === 'papertrader' && (
        <HermesPaperTraderCard
          latestBrief={hermesBrief}
          livePrices={livePricesMap}
          onPositionChanged={refreshAllData}
          soundEnabled={soundEnabled}
        />
      )}

      {/* 5. TAB 3: LIVE OPEN POSITIONS */}
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
                  <GlassCard key={pos.id} hoverEffect={false} className="p-4 space-y-3 border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
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
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-white/10">
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

      {/* 6. TAB 4: TRADE JOURNAL */}
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
                    className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
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
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-white/10">
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

      {/* 7. TAB 5: WEBHOOK LOGS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              TradingView Webhook Execution Signals ({webhookLogs.length})
            </h3>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer font-semibold"
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
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-white/10">
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

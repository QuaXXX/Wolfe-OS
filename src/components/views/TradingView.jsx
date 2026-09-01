import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Check,
  ChevronDown,
  SlidersHorizontal,
  ChevronUp
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
  // Navigation & Dropdowns
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'papertrader' | 'positions' | 'journal' | 'webhooks'
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [isMacroExpanded, setIsMacroExpanded] = useState(true);

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

  const viewDropdownRef = useRef(null);
  const actionsDropdownRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target)) {
        setIsViewDropdownOpen(false);
      }
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target)) {
        setIsActionsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const tabsConfig = [
    { id: 'overview', label: 'Morning War Room', icon: Compass, count: hermesBrief?.highConvictionPlays?.length || 0 },
    { id: 'papertrader', label: 'Forward-Test Desk', icon: Bot, count: paperPositions.length },
    { id: 'positions', label: 'Live Positions', icon: Layers, count: openPositions.length },
    { id: 'journal', label: 'Trade Journal', icon: BookOpen, count: tradeJournal.length },
    { id: 'webhooks', label: 'Webhook Signals', icon: Radio, count: webhookLogs.length }
  ];

  const currentTabObj = tabsConfig.find(t => t.id === activeTab) || tabsConfig[0];
  const CurrentIcon = currentTabObj.icon;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-24 select-none font-sans">
      {/* 1. SIGNATURE WOLFE OS TOP HEADER WITH CLEAN DROPDOWNS */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-blue-500/10">
        {/* Left: View Selector Dropdown */}
        <div className="relative" ref={viewDropdownRef}>
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsViewDropdownOpen(prev => !prev);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/40 text-blue-100 border border-blue-500/20 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)] active:scale-95"
          >
            <CurrentIcon className="w-4 h-4 text-blue-400" />
            <span className="font-bold">{currentTabObj.label}</span>
            {currentTabObj.count > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {currentTabObj.count}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-blue-400/70" />
          </button>

          {/* Dropdown Menu */}
          {isViewDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-56 rounded-2xl theme-card border border-blue-500/20 shadow-2xl backdrop-blur-2xl py-1.5 z-50 space-y-0.5 font-sans">
              <div className="px-3 py-1 text-[10px] font-semibold text-blue-300/70 uppercase tracking-wider">
                Select Workspace View
              </div>
              {tabsConfig.map(tab => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setActiveTab(tab.id);
                      setIsViewDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-200 border-l-2 border-blue-400'
                        : 'text-slate-300 hover:text-white hover:bg-blue-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.count > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-500/20">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Actions Dropdown & Realized PnL Pill */}
        <div className="flex items-center gap-2">
          {/* Actions & Settings Dropdown */}
          <div className="relative" ref={actionsDropdownRef}>
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsActionsDropdownOpen(prev => !prev);
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-950/30 hover:bg-blue-900/40 text-blue-200 border border-blue-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Actions</span>
              <ChevronDown className="w-3 h-3 text-blue-400/60" />
            </button>

            {isActionsDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl theme-card border border-blue-500/20 shadow-2xl backdrop-blur-2xl py-1.5 z-50 space-y-0.5 font-sans">
                <div className="px-3 py-1 text-[10px] font-semibold text-blue-300/70 uppercase tracking-wider">
                  Desk Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsWarRoomOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-900/30 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Hermes Council</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsWebhookModalOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-900/30 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-blue-400" />
                  <span>Webhooks Setup</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsHyperliquidOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-900/30 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-blue-400" />
                  <span>Hyperliquid Bridge</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedTradeForEdit(null);
                    setIsJournalModalOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-900/30 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>Log Manual Trade</span>
                </button>
              </div>
            )}
          </div>

          {/* Realized PnL */}
          <div className="px-3 py-1 rounded-xl bg-blue-950/30 text-right border border-blue-500/15 min-w-[100px]">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Realized P&L</div>
            <div className={`text-xs font-mono font-bold ${stats.totalPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnlUSD >= 0 ? `+$${stats.totalPnlUSD.toFixed(2)}` : `-$${Math.abs(stats.totalPnlUSD).toFixed(2)}`}
            </div>
          </div>
        </div>
      </div>

      {/* 2. TAB 1: MORNING WAR ROOM */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Collapsible Macro Regime Summary */}
          {hermesBrief && (
            <GlassCard hoverEffect={false} className="p-3.5 space-y-1 border-blue-500/20">
              <div 
                onClick={() => setIsMacroExpanded(prev => !prev)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white tracking-wide">{hermesBrief.macroRegime}</span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                    Skeptic Approved
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <span className="text-[10px] font-mono text-blue-300/80">{hermesBrief.date}</span>
                  {isMacroExpanded ? <ChevronUp className="w-3.5 h-3.5 text-blue-400" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-400" />}
                </div>
              </div>
              {isMacroExpanded && (
                <p className="text-xs text-slate-300 leading-relaxed pt-1.5 border-t border-blue-500/10">
                  {hermesBrief.macroAnalysis}
                </p>
              )}
            </GlassCard>
          )}

          {/* Plays of the Day Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-200/90 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-400" />
                <span>Plays of the Day ({hermesBrief?.highConvictionPlays?.length || 4})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(hermesBrief?.highConvictionPlays || []).map((play, idx) => {
                const isLong = play.bias === 'LONG';
                const isAlreadyTracking = paperPositions.some(p => p.ticker === play.ticker && p.status !== 'CLOSED');

                return (
                  <GlassCard key={idx} hoverEffect={false} className="p-3.5 space-y-2.5 border-blue-500/15">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white font-mono">{play.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                          isLong ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                        }`}>
                          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {play.bias}
                        </span>
                        <span className="text-[10px] font-mono text-blue-300 font-semibold">Grade: <strong className="text-white">{play.convictionGrade}</strong></span>
                      </div>

                      {/* Forward-Test Button */}
                      <button
                        type="button"
                        onClick={() => handleEnterIndividualPlay(play)}
                        disabled={isAlreadyTracking}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                          isAlreadyTracking
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 opacity-90'
                            : 'bg-blue-950/40 hover:bg-blue-900/50 text-blue-200 border border-blue-500/20 hover:border-blue-500/40'
                        }`}
                      >
                        {isAlreadyTracking ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3 text-blue-400" />}
                        <span>{isAlreadyTracking ? 'In Desk' : 'Forward-Test'}</span>
                      </button>
                    </div>

                    {/* Timeframe & Trade Duration */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="text-blue-100 font-medium">{play.timeframe || '1H - 4H Intraday'}</span>
                      <span>•</span>
                      <span>{play.expectedDuration || '3 - 8h'}</span>
                    </div>

                    {/* Entry, Stop Loss, 2R Take Profit Matrix */}
                    <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-blue-950/50 border border-blue-500/15 font-mono text-xs">
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
                      <strong className="text-blue-300/80">Thesis:</strong> {play.thesis}
                    </p>

                    <div className="text-[11px] text-slate-400 pt-1 border-t border-blue-500/10 font-sans">
                      <strong className="text-rose-400">Invalidation:</strong> {play.invalidation}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>

          {/* Clean Real-Time Watchlist */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-200/90">
                Live Watchlist ({watchlist.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsAddingTicker(prev => !prev)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ticker</span>
              </button>
            </div>

            {isAddingTicker && (
              <form onSubmit={handleAddTicker} className="flex gap-2 p-2 rounded-2xl theme-card border border-blue-500/20">
                <input
                  type="text"
                  value={newTickerInput}
                  onChange={(e) => setNewTickerInput(e.target.value)}
                  placeholder="Ticker (e.g. SUI, AVAX)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/20 text-white font-mono text-xs outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold cursor-pointer bg-blue-600 hover:bg-blue-500 transition-all shadow-md"
                >
                  Add
                </button>
              </form>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {watchlist.map((stock) => (
                <GlassCard key={stock.symbol} hoverEffect={false} className="p-2.5 border-blue-500/15">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs font-mono">{stock.symbol}</span>
                    <span className="text-[9px] text-emerald-400 font-mono">Live</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-blue-100 mt-0.5">
                    ${stock.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB 2: FORWARD-TEST PAPER DESK */}
      {activeTab === 'papertrader' && (
        <HermesPaperTraderCard
          latestBrief={hermesBrief}
          livePrices={livePricesMap}
          onPositionChanged={refreshAllData}
          soundEnabled={soundEnabled}
        />
      )}

      {/* 4. TAB 3: LIVE OPEN POSITIONS */}
      {activeTab === 'positions' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-200/90">
              Active Hyperliquid Positions ({openPositions.length})
            </h3>
          </div>

          {openPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {openPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                return (
                  <GlassCard key={pos.id} hoverEffect={false} className="p-4 space-y-3 border-blue-500/15">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                        }`}>
                          {pos.side} {pos.leverage}x
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClosePosition(pos.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer transition-all"
                      >
                        Market Close
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-blue-950/50 border border-blue-500/15 font-mono text-xs">
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
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-blue-500/15">
              <div className="w-10 h-10 rounded-2xl bg-blue-950/40 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
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

      {/* 5. TAB 4: TRADE JOURNAL */}
      {activeTab === 'journal' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-200/90">
              Completed Trade History & AI Reviews ({tradeJournal.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setSelectedTradeForEdit(null);
                setIsJournalModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 text-white border border-blue-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span>Log Trade Manually</span>
            </button>
          </div>

          {tradeJournal.length > 0 ? (
            <div className="space-y-2">
              {tradeJournal.map((trade) => {
                const isWin = trade.pnlUSD >= 0;
                return (
                  <GlassCard
                    key={trade.id}
                    hoverEffect={false}
                    className="p-3 border-blue-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                        isWin ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                      }`}>
                        {trade.ticker}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-white">{trade.side}</span>
                          <span className="text-slate-300 text-[11px]">${trade.entryPrice} ➔ ${trade.exitPrice}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{trade.strategy}</div>
                      </div>
                    </div>

                    {/* AI Post-Mortem Quote */}
                    {trade.aiPostMortem && (
                      <div className="flex-1 max-w-md text-[11px] text-blue-200/80 italic truncate hidden lg:block">
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
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-blue-500/15">
              <div className="w-10 h-10 rounded-2xl bg-blue-950/40 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
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

      {/* 6. TAB 5: WEBHOOK LOGS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-200/90">
              TradingView Webhook Signals ({webhookLogs.length})
            </h3>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-semibold"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Configure Alerts</span>
            </button>
          </div>

          {webhookLogs.length > 0 ? (
            <div className="space-y-2">
              {webhookLogs.map((log) => (
                <GlassCard key={log.id} hoverEffect={false} className="p-3 border-blue-500/15 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-white">{log.action} {log.ticker}</span>
                      <span className="text-blue-200 ml-2">@ ${log.price}</span>
                      <div className="text-[10px] text-slate-400 font-sans">{log.strategy} • {new Date(log.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {log.status}
                  </span>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2 border-blue-500/15">
              <div className="w-10 h-10 rounded-2xl bg-blue-950/40 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
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

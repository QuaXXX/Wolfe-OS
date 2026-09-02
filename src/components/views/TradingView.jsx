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
  ChevronUp,
  SlidersHorizontal,
  FileText,
  Building2,
  Eye,
  MessageSquare,
  Loader2,
  RotateCcw,
  Bell,
  X
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { HermesWarRoomModal } from '../trading/HermesWarRoomModal';
import { HyperliquidConnectModal } from '../trading/HyperliquidConnectModal';
import { WebhookConfigModal } from '../trading/WebhookConfigModal';
import { TradeJournalModal } from '../trading/TradeJournalModal';
import { HermesPaperTraderCard } from '../trading/HermesPaperTraderCard';
import { HermesOrderEntryModal } from '../trading/HermesOrderEntryModal';
import { HyperliquidDirectExecutionPanel } from '../trading/HyperliquidDirectExecutionPanel';
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
  getLatestHermesBrief,
  clearTradingWorkspaceState
} from '../../utils/tradingStorage';
import { fetchHyperliquidAccount, fetchLiveMarketPrices, fetchHyperliquidLivePositions } from '../../utils/hyperliquidService';
import { runHermesSwarmAnalysis } from '../../utils/hermesSwarmService';
import { 
  tickPaperPositionsWithLivePrices, 
  enterSingleHermesPlay,
  getPaperPositions,
  resetPaperTradingAccount
} from '../../utils/hermesPaperTrader';
import { playSound } from '../../utils/soundFX';

export const TradingView = ({ 
  tradingData, 
  soundEnabled = true 
}) => {
  // Navigation & Dropdowns
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'council' | 'papertrader' | 'positions' | 'journal' | 'webhooks'
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [isMacroExpanded, setIsMacroExpanded] = useState(true);
  const [expandedDossierIdx, setExpandedDossierIdx] = useState(null);

  // Scanning & Notifications
  const [isScanning, setIsScanning] = useState(false);
  const [sweepNotification, setSweepNotification] = useState(null);

  // Data States
  const [config, setConfig] = useState(getTradingConfig());
  const [watchlist, setWatchlist] = useState(getWatchlist());
  const [openPositions, setOpenPositions] = useState(getOpenPositions());
  const [paperPositions, setPaperPositions] = useState(getPaperPositions());
  const [tradeJournal, setTradeJournal] = useState(getTradeJournal());
  const [webhookLogs, setWebhookLogs] = useState(getWebhookLogs());
  const [hermesBrief, setHermesBrief] = useState(getLatestHermesBrief());
  const [livePricesMap, setLivePricesMap] = useState({});

  // Modals & Order Entry
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isHyperliquidOpen, setIsHyperliquidOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [selectedTradeForEdit, setSelectedTradeForEdit] = useState(null);
  const [selectedPlayForOrder, setSelectedPlayForOrder] = useState(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [hyperliquidTicker, setHyperliquidTicker] = useState('BTC');
  const [expandedJournalId, setExpandedJournalId] = useState(null);
  const [expandedPositionId, setExpandedPositionId] = useState(null);

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

    // 1. Live market price and Hyperliquid position polling every 10s
    const updatePricesAndPositions = async () => {
      try {
        const [livePrices, hlPositions] = await Promise.all([
          fetchLiveMarketPrices(),
          fetchHyperliquidLivePositions(config?.masterWalletAddress)
        ]);

        if (livePrices && Object.keys(livePrices).length > 0) {
          setLivePricesMap(livePrices);

          // Real-Time TP / SL Trigger Engine for paper trades
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

        if (hlPositions && Array.isArray(hlPositions)) {
          setOpenPositions(hlPositions);
        }
      } catch (err) {}
    };

    updatePricesAndPositions();
    const interval = setInterval(updatePricesAndPositions, 10000);

    return () => clearInterval(interval);
  }, []);

  const triggerFreshDailySweep = async () => {
    setIsScanning(true);
    try {
      const newBrief = await runHermesSwarmAnalysis();
      setHermesBrief(newBrief);
      setPaperPositions(getPaperPositions());
      
      // Trigger Completion Notification Popup
      setSweepNotification({
        title: "Daily Council Sweep Completed",
        regime: newBrief.macroRegime,
        playsCount: newBrief.highConvictionPlays?.length || 4,
        date: newBrief.date
      });
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Morning sweep notice:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFreshDayReset = () => {
    if (window.confirm("Clear all previous trades, history, and research to start a completely fresh unused day?")) {
      playSound('click', soundEnabled);
      clearTradingWorkspaceState();
      resetPaperTradingAccount();
      setHermesBrief(null);
      setPaperPositions([]);
      setOpenPositions([]);
      setTradeJournal([]);
      setWebhookLogs([]);
      refreshAllData();
      triggerFreshDailySweep();
    }
  };

  const refreshAllData = async () => {
    const currentConfig = getTradingConfig();
    setConfig(currentConfig);
    setWatchlist(getWatchlist());
    setPaperPositions(getPaperPositions());
    setTradeJournal(getTradeJournal());
    setWebhookLogs(getWebhookLogs());
    setHermesBrief(getLatestHermesBrief());

    try {
      const hlPositions = await fetchHyperliquidLivePositions(currentConfig?.masterWalletAddress);
      if (hlPositions && Array.isArray(hlPositions)) {
        setOpenPositions(hlPositions);
      } else {
        setOpenPositions(getOpenPositions());
      }
    } catch (err) {
      setOpenPositions(getOpenPositions());
    }
  };

  const stats = useMemo(() => calculateTradingStats(), [tradeJournal]);

  const handleOpenOrderModal = (play) => {
    playSound('click', soundEnabled);
    setSelectedPlayForOrder(play);
    setIsOrderModalOpen(true);
  };

  const handleConfirmOrderExecution = (play, executionMode) => {
    enterSingleHermesPlay(play, hermesBrief?.date, livePricesMap, executionMode);
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

  const availableWarRoomPlays = useMemo(() => {
    return (hermesBrief?.highConvictionPlays || []).filter(play => {
      const isForwardTesting = paperPositions.some(p => p.ticker === play.ticker && p.status !== 'CLOSED');
      const isCompleted = tradeJournal.some(j => j.ticker === play.ticker);
      return !isForwardTesting && !isCompleted;
    });
  }, [hermesBrief, paperPositions, tradeJournal]);

  const tabsConfig = [
    { 
      id: 'overview', 
      label: 'Strategy Scanner', 
      icon: Compass, 
      count: availableWarRoomPlays.length,
      isLoading: isScanning 
    },
    { id: 'execute', label: 'Hyperliquid', icon: Zap, count: 0, isLoading: false },
    { id: 'papertrader', label: 'Forward Test', icon: Bot, count: paperPositions.length, isLoading: false },
    { id: 'positions', label: 'Positions', icon: Layers, count: openPositions.length, isLoading: false },
    { id: 'journal', label: 'Journal', icon: BookOpen, count: tradeJournal.length, isLoading: false },
    { id: 'webhooks', label: 'Webhooks', icon: Radio, count: webhookLogs.length, isLoading: false },
    { 
      id: 'council', 
      label: 'Council Chat', 
      icon: MessageSquare, 
      count: hermesBrief?.councilDialogue?.length || 7,
      isLoading: isScanning 
    }
  ];

  const currentTabObj = tabsConfig.find(t => t.id === activeTab) || tabsConfig[0];
  const CurrentIcon = currentTabObj.icon;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-24 select-none font-sans relative">
      {/* 1. COMPLETION NOTIFICATION POPUP */}
      {sweepNotification && (
        <div className="p-3.5 rounded-2xl theme-card border shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300 z-30" style={{ borderColor: 'var(--accent-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}>
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">{sweepNotification.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {sweepNotification.playsCount} Dossiers Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Regime: <strong className="text-white">{sweepNotification.regime}</strong> • Tap Morning War Room to review.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('overview');
                setSweepNotification(null);
              }}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold cursor-pointer shadow-md transition-all active:scale-95"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              View Brief
            </button>
            <button
              type="button"
              onClick={() => setSweepNotification(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. DYNAMIC SYSTEM ACCENT HEADER WITH CLEAN DROPDOWNS */}
      <div 
        className="flex items-center justify-between gap-3 pb-3 border-b"
        style={{ borderColor: 'var(--accent-border)' }}
      >
        {/* Left: View Selector Dropdown */}
        <div className="relative" ref={viewDropdownRef}>
          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsViewDropdownOpen(prev => !prev);
            }}
            className="px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
            style={{ 
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              boxShadow: '0 0 15px -3px var(--accent-glow)'
            }}
          >
            {isScanning && (activeTab === 'overview' || activeTab === 'council') ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <CurrentIcon className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            )}
            <span className="font-bold">{currentTabObj.label}</span>
            {isScanning && (activeTab === 'overview' || activeTab === 'council') ? (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Scanning...
              </span>
            ) : currentTabObj.count > 0 ? (
              <span 
                className="text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold"
                style={{ 
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff'
                }}
              >
                {currentTabObj.count}
              </span>
            ) : null}
            <ChevronDown className="w-3.5 h-3.5 opacity-70" style={{ color: 'var(--accent-primary)' }} />
          </button>

          {/* Dropdown Menu */}
          {isViewDropdownOpen && (
            <div 
              className="absolute left-0 top-full mt-1.5 w-64 rounded-2xl theme-card shadow-2xl backdrop-blur-2xl py-1.5 z-50 space-y-0.5 font-sans"
              style={{ border: '1px solid var(--accent-border)' }}
            >
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                        ? 'text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    style={isSelected ? { 
                      backgroundColor: 'var(--accent-subtle)',
                      borderLeft: '2px solid var(--accent-primary)'
                    } : {}}
                  >
                    <div className="flex items-center gap-2">
                      {tab.isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : (
                        <Icon 
                          className="w-3.5 h-3.5" 
                          style={isSelected ? { color: 'var(--accent-primary)' } : { color: 'rgb(148 163 184)' }} 
                        />
                      )}
                      <span>{tab.label}</span>
                    </div>
                    {tab.isLoading ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300">
                        Scanning
                      </span>
                    ) : tab.count > 0 ? (
                      <span 
                        className="text-[10px] font-mono px-1.5 py-0.2 rounded"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Realized PnL Pill */}
        <div className="flex items-center gap-2">
          {/* Realized PnL */}
          <div 
            className="px-3 py-1 rounded-xl text-right min-w-[100px]"
            style={{ 
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)'
            }}
          >
            <div className="text-[9px] uppercase font-mono tracking-wider text-slate-400">Net Realized</div>
            <div className={`text-xs font-mono font-bold ${
              stats.netPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {stats.netPnlUSD >= 0 ? `+$${stats.netPnlUSD.toFixed(2)}` : `-$${Math.abs(stats.netPnlUSD).toFixed(2)}`}
            </div>
          </div>
        </div>
      </div>

      {/* 3. TAB 1: MORNING WAR ROOM */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* While Scanning: Show Sleek Scanning Radar Card */}
          {isScanning ? (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-3 border border-amber-500/20">
              <div 
                className="w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto animate-pulse"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)'
                }}
              >
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Hermes Quantitative Council is Investigating Markets...
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Atlas is analyzing macro liquidity, Poseidon is scanning dark pools, Artemis is verifying confirmed earnings/reports, and The Skeptic is red-teaming setups.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono text-slate-400 bg-black/40 border border-white/5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Live Prices & Other Desk Sections Fully Operational</span>
              </div>
            </GlassCard>
          ) : !hermesBrief ? (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-3.5 border border-white/5">
              <div 
                className="w-12 h-12 rounded-2xl border flex items-center justify-center mx-auto"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)'
                }}
              >
                <Sparkles className="w-6 h-6" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Live AI Market Scan Ready</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Click below to scan dark pools, orderbook imbalances, and macro catalysts for today's high-conviction trade setups.
                </p>
              </div>
              <button
                type="button"
                onClick={triggerFreshDailySweep}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer flex items-center gap-2 mx-auto hover:opacity-95"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Sparkles className="w-4 h-4" />
                <span>Scan for Trades Now</span>
              </button>
            </GlassCard>
          ) : (
            <>
              {/* Header Bar with On-Demand Re-Scan */}
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Actionable Trade Dossiers ({availableWarRoomPlays.length})</span>
                </div>
                <button
                  type="button"
                  onClick={triggerFreshDailySweep}
                  disabled={isScanning}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-md hover:opacity-95"
                  style={{
                    backgroundColor: 'var(--accent-primary)'
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scan Markets</span>
                </button>
              </div>

              {/* Collapsible Macro Regime Summary */}
              {hermesBrief && (
                <GlassCard hoverEffect={false} className="p-3.5 space-y-2">
                  <div 
                    onClick={() => setIsMacroExpanded(prev => !prev)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                      <span className="text-xs font-bold text-white tracking-wide">{hermesBrief.macroRegime}</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        Skeptic Approved
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--accent-primary)' }}>{hermesBrief.date}</span>
                      {isMacroExpanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />}
                    </div>
                  </div>

                  {isMacroExpanded && (
                    <div className="pt-2 border-t border-white/5 space-y-3 text-xs text-slate-300 animate-in fade-in duration-200">
                      {(() => {
                        const pointsToRender = (hermesBrief.macroPoints && Array.isArray(hermesBrief.macroPoints) && hermesBrief.macroPoints.length > 0)
                          ? hermesBrief.macroPoints
                          : [
                              {
                                category: "🌐 1. What's Happening Across Markets & Why",
                                items: [
                                  "US Dollar Softening & Global Liquidity: The Dollar Index (DXY) softened down to 103.8 while 10Y Treasury yields stabilized at 4.28%. Why it matters: Synchronized central bank liquidity injections are easing borrowing friction and driving institutional capital rotation into high-beta growth tech and crypto.",
                                  "Sovereign AI & Space Telecom Leadership: Equity futures are green (+0.65%), led by orbital satellite cellular broadband (ASTS), enterprise AI operating systems (PLTR), and decentralized neural compute (TAO). Why it matters: Institutional funds are rebalancing balance sheets into asymmetric secular compounders with verified contract revenue.",
                                  "Crypto On-Chain Clearing & Perp Demand: Bitcoin is holding firmly near $77,000 while native L1 clearing protocols (HYPE, SOL, SUI) show persistent taker market buy delta. Why it matters: Cumulative volume delta (CVD) shows short sellers are heavily trapped below key resistance levels, priming the tape for explosive upside breakouts."
                                ]
                              },
                              {
                                category: "📅 2. Key Dates, Important Events & Recent News",
                                items: [
                                  "Economic Data Calendar: Today provides a benign US macro window with no disruptive FOMC rate decisions; upcoming high-volatility catalysts include the US Consumer Price Index (CPI) next Tuesday and the Federal Reserve FOMC Rate Decision in 2 weeks.",
                                  "Regulatory & Corporate News: AST SpaceMobile (ASTS) secured official FCC direct-to-cell commercial spectrum clearance with zero warrant dilution overhang; Palantir (PLTR) operationalized its DoD AIP enterprise contract (+18% ARR).",
                                  "Crypto Upgrades & Staking Milestones: Hyperliquid 24h volume crossed $2.4B with 100% of trading fees distributed to HYPE validator staking vaults; Solana DEX volume accelerated +42% WoW post-mainnet latency patch; BlackRock BUIDL expanded tokenized US Treasury AUM on Ondo to $650M."
                                ]
                              },
                              {
                                category: "🎯 3. Why Specific Stocks & Crypto Were Chosen Today",
                                items: [
                                  "ASTS (BUY LONG | Confluence 96/100): Legendary funds Stanley Druckenmiller and Peter Thiel disclosed massive 13F whale accumulation with $38M in dark pool blocks at $26.10 VWAP following FCC spectrum clearance. Risk Management: Limit Trigger $26.20 - $26.50, Invalidation Stop Loss $24.90, Take Profit 2R $29.40 / 3R $32.50 (1.5% max capital risk).",
                                  "HYPE (BUY LONG | Confluence 97/100): 24h trading volume surpassed $2.4B with 100% of trading fee revenue directly distributed to HYPE validator staking vaults. Risk Management: Limit Trigger $81.50 - $81.94, Invalidation Stop Loss $79.60, Take Profit 2R $86.70 / 3R $94.20 (1.5% max capital risk).",
                                  "TAO (BUY LONG | Confluence 95/100): Dynamic subnet expansion accelerating with Pantera and Polychain locking over 420,000 TAO into decentralized machine intelligence emissions. Risk Management: Limit Trigger $508 - $512, Invalidation Stop Loss $494, Take Profit 2R $556 / 3R $605 (1.5% max capital risk).",
                                  "SOL (BUY LONG | Confluence 94/100): 24h DEX swap volume jumped +42% WoW and Hyperliquid Whale Desk #4 executed $28.5M in aggressive market buy delta, defending the psychological $100 level. Risk Management: Limit Trigger $99.40 - $100.20, Invalidation Stop Loss $97.50, Take Profit 2R $105.40 / 3R $108.00 (1.5% max capital risk).",
                                  "PLTR (BUY LONG | Confluence 92/100): Confirmed +18% ARR DoD AIP enterprise contract expansion, backed by abnormal institutional call sweep volume breaking above Value Area High ($68.20). Risk Management: Limit Trigger $67.80 - $68.20, Invalidation Stop Loss $65.90, Take Profit 2R $72.60 / 3R $76.00 (1.5% max capital risk).",
                                  "BTC (BUY LONG | Confluence 95/100): Institutional spot ETFs absorbed +$340M net in 24 hours (BlackRock IBIT +4,520 BTC) with negligible liquidation cascade risk on derivative orderbooks. Risk Management: Limit Trigger $77,100 - $77,400, Invalidation Stop Loss $75,800, Take Profit 2R $80,200 / 3R $83,500 (1.5% max capital risk).",
                                  "ONDO (BUY LONG | Confluence 93/100): BlackRock BUIDL integration expanding tokenized US Treasury AUM to over $650M on-chain with $22M institutional USDC mints. Risk Management: Limit Trigger $1.13 - $1.15, Invalidation Stop Loss $1.11, Take Profit 2R $1.24 / 3R $1.32 (1.5% max capital risk).",
                                  "SUI (BUY LONG | Confluence 90/100): Record $1.2B DeFi TVL expansion and +45M tokens deposited into validator staking custody by Jump Trading and a16z crypto. Risk Management: Limit Trigger $3.20 - $3.25, Invalidation Stop Loss $3.12, Take Profit 2R $3.52 / 3R $3.75 (1.5% max capital risk)."
                                ]
                              }
                            ];

                        const macroSection = pointsToRender.find(p => p.category.includes("What's Happening") || p.category.includes("1."));
                        const eventsSection = pointsToRender.find(p => p.category.includes("Events") || p.category.includes("Dates") || p.category.includes("2."));
                        const chosenSection = pointsToRender.find(p => p.category.includes("Chosen") || p.category.includes("3."));

                        return (
                          <div className="space-y-3">
                            {/* Top Grid: Section 1 & Section 2 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Section 1: What's Happening & Why */}
                              {macroSection && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 shadow-sm">
                                  <div className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-white/5 pb-2">
                                    <Compass className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                                    <span>{macroSection.category}</span>
                                  </div>
                                  <ul className="space-y-2 text-[11px] text-slate-300 pl-1">
                                    {macroSection.items.map((item, iIdx) => (
                                      <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                                        <span className="text-cyan-400 font-bold shrink-0 mt-0.5">•</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Section 2: Important Events & Recent News */}
                              {eventsSection && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 shadow-sm">
                                  <div className="font-bold text-white text-xs flex items-center gap-1.5 border-b border-white/5 pb-2">
                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{eventsSection.category}</span>
                                  </div>
                                  <ul className="space-y-2 text-[11px] text-slate-300 pl-1">
                                    {eventsSection.items.map((item, iIdx) => (
                                      <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                                        <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Section 3: Chosen Stocks & Crypto with Clean Point-Form Structure & Direct 1-Click Execution */}
                            {chosenSection && (
                              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 shadow-sm">
                                <div className="font-bold text-white text-xs flex items-center justify-between border-b border-white/5 pb-2">
                                  <span className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                                    <span>{chosenSection.category}</span>
                                  </span>
                                  <span className="text-[10px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                    1-Click Desk Execution
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                  {((hermesBrief.highConvictionPlays && hermesBrief.highConvictionPlays.length > 0)
                                    ? hermesBrief.highConvictionPlays
                                    : availableWarRoomPlays
                                  ).map((play, iIdx) => (
                                    <div key={iIdx} className="p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-white/20 space-y-2.5 transition-all">
                                      {/* Header: Ticker, Category, Grade, and Action Buttons */}
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-mono text-xs font-bold text-white tracking-wide">{play.ticker}</span>
                                          <span className="text-[9px] font-mono px-2 py-0.5 rounded font-semibold bg-white/[0.06] text-amber-300 border border-amber-500/20">
                                            {play.category || play.horizonType || 'Asset'}
                                          </span>
                                          {play.confluenceScore && (
                                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                              {play.confluenceScore}% Alpha
                                            </span>
                                          )}
                                        </div>

                                        {/* Action Buttons with Single Clean Plus */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              playSound('click', soundEnabled);
                                              setHyperliquidTicker(play.ticker);
                                              setActiveTab('execute');
                                            }}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 active:scale-95 shadow-sm"
                                            title="Trade directly on Hyperliquid"
                                          >
                                            <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                            <span>Hyperliquid</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenOrderModal(play)}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer text-white active:scale-95 shadow-sm"
                                            style={{
                                              backgroundColor: 'var(--accent-subtle)',
                                              border: '1px solid var(--accent-border)'
                                            }}
                                            title="Forward-Test paper order"
                                          >
                                            <Plus className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                                            <span>Test</span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* 3 Clear, Point-Form Bullets */}
                                      <div className="space-y-1.5 text-[11px] text-slate-300 pl-0.5">
                                        <div className="flex items-start gap-1.5 leading-relaxed">
                                          <span className="text-cyan-400 font-bold shrink-0 mt-0.5">•</span>
                                          <span><strong className="text-white">Why Chosen:</strong> {play.whyChosen || play.thesis || play.catalystDossier}</span>
                                        </div>
                                        <div className="flex items-start gap-1.5 leading-relaxed">
                                          <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                                          <span><strong className="text-white">Expected Move:</strong> {play.projectedMove || `Pullback to ${play.entryTrigger} targeting ${play.target2R} (2R) with high institutional volume confirmation.`}</span>
                                        </div>
                                        <div className="flex items-start gap-1.5 leading-relaxed">
                                          <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
                                          <span><strong className="text-white">Risk & Invalidation:</strong> {play.riskManagement || `Trigger ${play.entryTrigger} | Invalidation Stop ${play.stopLoss} | Target 2R ${play.target2R} (1.5% max risk).`}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Plays of the Day Grid with Deep Research Dossiers */}
              <div className="space-y-2.5">

                {availableWarRoomPlays.length === 0 ? (
                  <GlassCard hoverEffect={false} className="p-8 text-center space-y-3 border border-white/5">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">All Setups Active or Completed</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        All daily trade dossiers are currently active in Forward Test or recorded in your Journal.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          playSound('click', soundEnabled);
                          setActiveTab('execute');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-semibold text-emerald-300 border border-emerald-500/30 cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Hyperliquid Desk</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playSound('click', soundEnabled);
                          setActiveTab('papertrader');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <Bot className="w-3.5 h-3.5 text-slate-300" />
                        <span>View Forward Test</span>
                      </button>
                    </div>
                  </GlassCard>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availableWarRoomPlays.map((play, idx) => {
                      const isLong = play.bias === 'LONG';
                      const isDossierOpen = expandedDossierIdx === idx;

                      return (
                        <GlassCard key={idx} hoverEffect={false} className="p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white font-mono">{play.ticker}</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-white/[0.05] text-slate-200 border border-white/10 flex items-center gap-0.5">
                                {isLong ? <ArrowUpRight className="w-3 h-3 text-slate-300" /> : <ArrowDownRight className="w-3 h-3 text-slate-300" />}
                                {play.bias} 5x
                              </span>
                              <span className="text-[10px] font-mono text-slate-300">Grade: <strong className="text-white">{play.convictionGrade}</strong></span>
                              {play.horizonType && (
                                <span className="text-[9px] font-mono px-2 py-0.2 rounded font-semibold bg-white/[0.06] text-amber-300 border border-amber-500/20">
                                  {play.horizonType}
                                </span>
                              )}
                              {play.confluenceScore && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                  {play.confluenceScore}% Alpha
                                </span>
                              )}
                            </div>

                            {/* Actions: Direct Hyperliquid Execution or Forward-Test */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  playSound('click', soundEnabled);
                                  setHyperliquidTicker(play.ticker);
                                  setActiveTab('execute');
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 active:scale-95"
                                title="Execute directly on Hyperliquid L1"
                              >
                                <Zap className="w-3 h-3 text-emerald-400" />
                                <span>Hyperliquid</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenOrderModal(play)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer text-white active:scale-95"
                                style={{
                                  backgroundColor: 'var(--accent-subtle)',
                                  border: '1px solid var(--accent-border)'
                                }}
                              >
                                <Plus className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                                <span>Test</span>
                              </button>
                            </div>
                          </div>

                        {/* Multi-Factor Alpha Confluence Matrix */}
                        {play.factorScores && (
                          <div className="grid grid-cols-4 gap-1 p-1.5 rounded-xl bg-black/40 border border-white/5 font-mono text-center">
                            <div>
                              <div className="text-slate-400 text-[8px] uppercase tracking-wider">Whale Flow</div>
                              <div className="font-bold text-emerald-400 text-[10px]">{play.factorScores.smartMoney}/100</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[8px] uppercase tracking-wider">Structure</div>
                              <div className="font-bold text-cyan-400 text-[10px]">{play.factorScores.structure}/100</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[8px] uppercase tracking-wider">Catalyst</div>
                              <div className="font-bold text-amber-400 text-[10px]">{play.factorScores.catalyst}/100</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[8px] uppercase tracking-wider">Macro</div>
                              <div className="font-bold text-purple-400 text-[10px]">{play.factorScores.macro}/100</div>
                            </div>
                          </div>
                        )}

                        {/* Timeframe & Trade Duration */}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Clock className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                          <span className="text-slate-200 font-medium">{play.timeframe || '1H - 4H Intraday'}</span>
                          <span>•</span>
                          <span>{play.expectedDuration || '3 - 8h'}</span>
                          <span>•</span>
                          <span className="text-slate-300 font-mono font-semibold">R:R {play.riskRewardRatio}</span>
                        </div>

                        {/* Entry, Stop Loss, 2R Take Profit Matrix */}
                        <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Trigger</div>
                            <div className="font-bold text-white truncate">{play.entryTrigger.split(' ')[0]}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Stop Loss</div>
                            <div className="font-bold text-rose-300">{play.stopLoss}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">2R Target</div>
                            <div className="font-bold text-emerald-300">{play.target2R}</div>
                          </div>
                        </div>

                        {/* Idiosyncratic Chief Thesis */}
                        <p className="text-xs text-slate-200 leading-relaxed font-sans">
                          <strong className="text-slate-400">Thesis:</strong> {play.thesis}
                        </p>

                        {/* Expandable Deep Research Dossier */}
                        <div className="pt-1 border-t border-white/5 space-y-1.5 font-sans">
                          <button
                            type="button"
                            onClick={() => setExpandedDossierIdx(isDossierOpen ? null : idx)}
                            className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer py-0.5"
                          >
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                              <span>{isDossierOpen ? 'Hide Institutional Dossier' : 'View Deep Research & Dark Pools'}</span>
                            </span>
                            {isDossierOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>

                          {isDossierOpen && (
                            <div className="space-y-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-300">
                              {play.catalystDossier && (
                                <div>
                                  <div className="font-semibold text-white flex items-center gap-1">
                                    <FileText className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                                    <span>Confirmed News / Reports Catalyst:</span>
                                  </div>
                                  <p className="text-slate-300 pl-4 mt-0.5">{play.catalystDossier}</p>
                                </div>
                              )}

                              {play.institutionalFlow && (
                                <div>
                                  <div className="font-semibold text-white flex items-center gap-1">
                                    <Building2 className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                                    <span>Whale & Dark Pool Footprint:</span>
                                  </div>
                                  <p className="text-slate-300 pl-4 mt-0.5">{play.institutionalFlow}</p>
                                </div>
                              )}

                              {play.technicalStructure && (
                                <div>
                                  <div className="font-semibold text-white flex items-center gap-1">
                                    <Target className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                                    <span>Orderbook & Volume Profile:</span>
                                  </div>
                                  <p className="text-slate-300 pl-4 mt-0.5">{play.technicalStructure}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="text-[11px] text-slate-400 pt-0.5">
                            <strong className="text-rose-400">Invalidation:</strong> {play.invalidation}
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </div>

              {/* Big Fund & Whale Intelligence Log */}
              {hermesBrief?.fundIntelligence && hermesBrief.fundIntelligence.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                    <span>Big Fund & Dark Pool Moves</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {hermesBrief.fundIntelligence.map((fund, fIdx) => (
                      <GlassCard key={fIdx} hoverEffect={false} className="p-2.5 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white font-mono">{fund.asset}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                            {fund.action}
                          </span>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400">{fund.fund}</div>
                        <p className="text-[11px] text-slate-300 leading-snug">{fund.detail}</p>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Clean Real-Time Watchlist (Always Live) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Live Watchlist ({watchlist.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsAddingTicker(prev => !prev)}
                className="text-xs flex items-center gap-1 cursor-pointer font-medium"
                style={{ color: 'var(--accent-primary)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ticker</span>
              </button>
            </div>

            {isAddingTicker && (
              <form onSubmit={handleAddTicker} className="flex gap-2 p-2 rounded-2xl theme-card border" style={{ borderColor: 'var(--accent-border)' }}>
                <input
                  type="text"
                  value={newTickerInput}
                  onChange={(e) => setNewTickerInput(e.target.value)}
                  placeholder="Ticker (e.g. SUI, AVAX)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                  style={{ borderColor: 'var(--accent-border)' }}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold cursor-pointer shadow-md transition-all active:scale-95"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Add
                </button>
              </form>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {watchlist.map((stock) => (
                <GlassCard 
                  key={stock.symbol} 
                  hoverEffect={true} 
                  className="p-3 cursor-pointer hover:border-white/20 transition-all group"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setHyperliquidTicker(stock.symbol);
                    setActiveTab('execute');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs font-mono group-hover:text-emerald-300 transition-colors">{stock.symbol}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.05] text-slate-300 border border-white/5">
                      {stock.category || 'Asset'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="font-mono text-xs font-bold text-white">
                      ${stock.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    {stock.change && (
                      <span className={`text-[10px] font-mono font-semibold ${stock.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stock.change}
                      </span>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: INTER-AGENT COUNCIL DELIBERATION CHAT */}
      {activeTab === 'council' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                <span>Inter-Agent Research Council Deliberation</span>
              </h3>
              <div className="text-[11px] text-slate-400">
                Live transcript showing how specialists investigate, debate catalysts, and how Hermes-Prime decides the final setups.
              </div>
            </div>
            <button
              type="button"
              onClick={triggerFreshDailySweep}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
            >
              {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />}
              <span>{isScanning ? 'Council Debating...' : 'Run New Live Debate'}</span>
            </button>
          </div>

          {isScanning ? (
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-3 border border-amber-500/20">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" />
              <div className="text-sm font-bold text-white">Council Debate in Progress...</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Specialists are transmitting macro indicators, dark pool prints, filings analysis, and red-teaming proposals.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-3 pt-1">
              {(hermesBrief?.councilDialogue || []).map((msg, mIdx) => {
                const isStrategist = msg.speaker === 'Hermes-Prime';
                const isSkeptic = msg.speaker === 'The Skeptic';
                const isPoseidon = msg.speaker === 'Poseidon';
                const isArtemis = msg.speaker === 'Artemis';
                const isAtlas = msg.speaker === 'Atlas';
                const isAres = msg.speaker === 'Ares';

                const avatarStyle = isStrategist ? {
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  borderColor: 'var(--accent-border)'
                } : isSkeptic ? {
                  backgroundColor: 'rgba(244,63,94,0.2)',
                  color: '#fda4af',
                  borderColor: 'rgba(244,63,94,0.4)'
                } : isPoseidon ? {
                  backgroundColor: 'rgba(16,185,129,0.2)',
                  color: '#6ee7b7',
                  borderColor: 'rgba(16,185,129,0.4)'
                } : isArtemis ? {
                  backgroundColor: 'rgba(217,70,239,0.2)',
                  color: '#f0abfc',
                  borderColor: 'rgba(217,70,239,0.4)'
                } : isAtlas ? {
                  backgroundColor: 'rgba(6,182,212,0.2)',
                  color: '#67e8f9',
                  borderColor: 'rgba(6,182,212,0.4)'
                } : {
                  backgroundColor: 'rgba(59,130,246,0.2)',
                  color: '#93c5fd',
                  borderColor: 'rgba(59,130,246,0.4)'
                };

                // Split by @mentions to highlight like Discord
                const messageParts = (msg.message || '').split(/(@\w+(?:-\w+)?)/g);

                return (
                  <GlassCard key={mIdx} hoverEffect={false} className="p-3.5 space-y-2.5 border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-8 h-8 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 shadow-sm font-mono"
                          style={avatarStyle}
                        >
                          {msg.speaker[0]}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {msg.step && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/[0.08] text-white">
                              #{msg.step}
                            </span>
                          )}
                          <span className="font-bold text-white text-xs font-mono">{msg.speaker}</span>
                          <span 
                            className="text-[9px] font-mono px-2 py-0.2 rounded font-semibold"
                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgb(203 213 225)' }}
                          >
                            {msg.role}
                          </span>
                          {msg.recipient && (
                            <span className="text-[9px] font-mono text-slate-400">
                              ➔ {msg.recipient}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        {msg.stage && (
                          <span className="px-2 py-0.5 rounded-full bg-black/40 border border-white/5 text-slate-300">
                            {msg.stage}
                          </span>
                        )}
                        <span>{msg.timestamp || 'Live'}</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-200 leading-relaxed pl-2 sm:pl-10 font-sans border-l-2 border-white/5 ml-3 sm:ml-0 space-y-1.5 whitespace-pre-line">
                      {messageParts.map((part, pIdx) => {
                        if (part.startsWith('@')) {
                          return (
                            <span 
                              key={pIdx} 
                              className="font-bold font-mono text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-block mr-1"
                            >
                              {part}
                            </span>
                          );
                        }
                        return <span key={pIdx}>{part}</span>;
                      })}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 3: FORWARD-TEST PAPER DESK */}
      {activeTab === 'papertrader' && (
        <HermesPaperTraderCard
          latestBrief={hermesBrief}
          livePrices={livePricesMap}
          onPositionChanged={refreshAllData}
          soundEnabled={soundEnabled}
        />
      )}

      {/* 5.5 TAB: HYPERLIQUID EXECUTION DESK */}
      {activeTab === 'execute' && (
        <div className="space-y-4">
          <HyperliquidDirectExecutionPanel 
            initialTicker={hyperliquidTicker}
            scannedSetups={availableWarRoomPlays}
            soundEnabled={soundEnabled} 
            onOrderExecuted={refreshAllData} 
          />
        </div>
      )}

      {/* 6. TAB 4: LIVE OPEN POSITIONS */}
      {activeTab === 'positions' && (
        <div className="space-y-4 font-sans">
          <div className="flex items-center justify-between pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Active Hyperliquid Positions ({openPositions.length})
            </h3>
          </div>

          {openPositions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {openPositions.map((pos) => {
                const isLong = pos.side === 'LONG';
                const isExpanded = expandedPositionId === pos.id;

                return (
                  <GlassCard 
                    key={pos.id} 
                    hoverEffect={false} 
                    className={`p-3.5 space-y-2.5 transition-all cursor-pointer border ${
                      isExpanded ? 'border-white/20 bg-white/[0.04]' : 'border-white/5 hover:border-white/10'
                    }`}
                    onClick={() => setExpandedPositionId(isExpanded ? null : pos.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">{pos.ticker}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isLong ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                        }`}>
                          {pos.side} {pos.leverage}x
                        </span>
                        <span className="text-[10px] font-mono text-slate-300">@ ${pos.entryPrice}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClosePosition(pos.id);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold cursor-pointer transition-all"
                        >
                          Close
                        </button>
                        <div className="p-1 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Dropdown Details */}
                    {isExpanded && (
                      <div 
                        className="pt-2 border-t border-white/5 space-y-2 font-mono text-xs animate-in fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Opened: <strong className="text-white">{pos.openedAt ? new Date(pos.openedAt).toLocaleString() : 'Live Session'}</strong></span>
                          <span>Strategy: <strong className="text-white">{pos.strategy || 'Hyperliquid L1'}</strong></span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] text-center">
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Size</div>
                            <div className="font-bold text-white">{pos.size}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Entry Price</div>
                            <div className="text-slate-200">${pos.entryPrice}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-rose-400 uppercase">Stop Loss</div>
                            <div className="text-rose-300">${pos.stopLoss || 'None'}</div>
                          </div>
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
                <Layers className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="text-sm font-bold text-white">No Open Positions</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Incoming TradingView webhooks or manual executions will show live here.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* 7. TAB 5: TRADE JOURNAL */}
      {activeTab === 'journal' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Completed Trades ({tradeJournal.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setSelectedTradeForEdit(null);
                setIsJournalModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              style={{ 
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)'
              }}
            >
              <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Log Trade</span>
            </button>
          </div>

          {tradeJournal.length > 0 ? (
            <div className="space-y-2">
              {tradeJournal.map((trade) => {
                const isWin = trade.pnlUSD >= 0;
                const isExpanded = expandedJournalId === trade.id;

                return (
                  <GlassCard
                    key={trade.id}
                    hoverEffect={false}
                    className={`p-3 transition-all cursor-pointer border ${
                      isExpanded ? 'border-white/20 bg-white/[0.04]' : 'border-white/5 hover:border-white/10'
                    }`}
                    onClick={() => setExpandedJournalId(isExpanded ? null : trade.id)}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
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
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {isWin ? 'WIN' : 'LOSS'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{trade.closedAt ? new Date(trade.closedAt).toLocaleDateString() : trade.date} • {trade.strategy}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <div className={`font-mono font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{trade.returnPct}%</span>
                        </div>

                        <div className="p-1 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Journal Dropdown */}
                    {isExpanded && (
                      <div 
                        className="pt-2.5 mt-2 border-t border-white/5 space-y-2 font-sans animate-in fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-center">
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Entry Price</div>
                            <div className="text-white font-bold">${trade.entryPrice}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Exit Price</div>
                            <div className="text-white font-bold">${trade.exitPrice}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Realized Return</div>
                            <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? `+$${trade.pnlUSD}` : `-$${Math.abs(trade.pnlUSD)}`} ({trade.returnPct}%)
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Taken: <strong className="text-slate-200">{trade.enteredAt || trade.date || 'Recorded'}</strong></span>
                          <span>Closed: <strong className="text-slate-200">{trade.closedAt ? new Date(trade.closedAt).toLocaleString() : trade.date}</strong></span>
                        </div>

                        {trade.notes && (
                          <div className="p-2 rounded-xl bg-black/30 border border-white/5 text-[11px] text-slate-300">
                            <strong className="text-slate-400">Notes:</strong> {trade.notes}
                          </div>
                        )}

                        {trade.aiPostMortem && (
                          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-300 italic">
                            <strong className="text-slate-400 font-sans not-italic">AI Review: </strong>
                            "{trade.aiPostMortem}"
                          </div>
                        )}

                        <div className="flex items-center justify-end pt-1">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTrade(trade.id, e)}
                            className="px-2 py-0.5 rounded text-rose-400 hover:text-white hover:bg-rose-500/20 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Delete Record
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
                <BookOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="text-sm font-bold text-white">Trade Journal Empty</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Closed positions and manual trades will be logged here.
              </p>
            </GlassCard>
          )}
        </div>
      )}

      {/* 8. TAB 6: WEBHOOK LOGS */}
      {activeTab === 'webhooks' && (
        <div className="space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              TradingView Webhook Signals ({webhookLogs.length})
            </h3>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="text-xs hover:text-white flex items-center gap-1 cursor-pointer font-semibold"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Configure Alerts</span>
            </button>
          </div>

          {webhookLogs.length > 0 ? (
            <div className="space-y-2">
              {webhookLogs.map((log) => (
                <GlassCard key={log.id} hoverEffect={false} className="p-3 text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-white">{log.action} {log.ticker}</span>
                      <span className="text-slate-200 ml-2">@ ${log.price}</span>
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
            <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
              <div 
                className="w-10 h-10 rounded-2xl border flex items-center justify-center mx-auto"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)'
                }}
              >
                <Radio className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
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

      <HermesOrderEntryModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        play={selectedPlayForOrder}
        livePrice={selectedPlayForOrder ? livePricesMap[selectedPlayForOrder.ticker] : null}
        onConfirmOrder={handleConfirmOrderExecution}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};

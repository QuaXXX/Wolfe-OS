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
import { fetchHyperliquidAccount, fetchLiveMarketPrices } from '../../utils/hyperliquidService';
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

    // 1. Live market price polling every 10s
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

    // 2. Automatic Morning Sweep: Check if today's brief exists
    const todayDate = new Date().toISOString().split('T')[0];
    const latest = getLatestHermesBrief();
    if (!latest || latest.date !== todayDate) {
      triggerFreshDailySweep();
    }

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

  const tabsConfig = [
    { 
      id: 'overview', 
      label: 'Morning War Room', 
      icon: Compass, 
      count: hermesBrief?.highConvictionPlays?.length || 0,
      isLoading: isScanning 
    },
    { 
      id: 'council', 
      label: 'Council Deliberation Chat', 
      icon: MessageSquare, 
      count: hermesBrief?.councilDialogue?.length || 7,
      isLoading: isScanning 
    },
    { id: 'papertrader', label: 'Forward-Test Desk', icon: Bot, count: paperPositions.length, isLoading: false },
    { id: 'execute', label: 'Hyperliquid 1-Click L1 Execution', icon: Zap, count: 0, isLoading: false },
    { id: 'positions', label: 'Live Positions', icon: Layers, count: openPositions.length, isLoading: false },
    { id: 'journal', label: 'Trade Journal', icon: BookOpen, count: tradeJournal.length, isLoading: false },
    { id: 'webhooks', label: 'Webhook Signals', icon: Radio, count: webhookLogs.length, isLoading: false }
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
              className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer text-slate-200 hover:text-white"
              style={{ 
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)'
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Actions</span>
              <ChevronDown className="w-3 h-3 opacity-60" style={{ color: 'var(--accent-primary)' }} />
            </button>

            {isActionsDropdownOpen && (
              <div 
                className="absolute right-0 top-full mt-1.5 w-52 rounded-2xl theme-card shadow-2xl backdrop-blur-2xl py-1.5 z-50 space-y-0.5 font-sans"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Desk Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsWarRoomOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Hermes War Room</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsWebhookModalOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Webhooks Setup</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setActiveTab('execute');
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>1-Click L1 Execution</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsHyperliquidOpen(true);
                    setIsActionsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
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
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Log Manual Trade</span>
                </button>

                <div className="my-1 border-t border-white/5" />

                {/* Reset to Fresh Day */}
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsDropdownOpen(false);
                    handleFreshDayReset();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Clear & Start Fresh Day</span>
                </button>
              </div>
            )}
          </div>

          {/* Realized PnL */}
          <div 
            className="px-3 py-1 rounded-xl text-right min-w-[100px]"
            style={{ 
              backgroundColor: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <div className="text-[9px] uppercase font-semibold text-slate-400">Realized P&L</div>
            <div className={`text-xs font-mono font-bold ${stats.totalPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnlUSD >= 0 ? `+$${stats.totalPnlUSD.toFixed(2)}` : `-$${Math.abs(stats.totalPnlUSD).toFixed(2)}`}
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
          ) : (
            <>
              {/* Collapsible Macro Regime Summary */}
              {hermesBrief && (
                <GlassCard hoverEffect={false} className="p-3.5 space-y-1">
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
                    <p className="text-xs text-slate-300 leading-relaxed pt-1.5 border-t border-white/5">
                      {hermesBrief.macroAnalysis}
                    </p>
                  )}
                </GlassCard>
              )}

              {/* Plays of the Day Grid with Deep Research Dossiers */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                    <span>Deep Research Trade Dossiers ({hermesBrief?.highConvictionPlays?.length || 4})</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(hermesBrief?.highConvictionPlays || []).map((play, idx) => {
                    const isLong = play.bias === 'LONG';
                    const trackedPosition = paperPositions.find(p => p.ticker === play.ticker && p.status !== 'CLOSED');
                    const isAlreadyTracking = !!trackedPosition;
                    const isPending = trackedPosition?.status === 'PENDING_ENTRY';
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
                          </div>

                          {/* Forward-Test Status / Action Button */}
                          {isAlreadyTracking ? (
                            <div className="flex items-center gap-1.5">
                              {isPending ? (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10 flex items-center gap-1 font-semibold">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>Waiting for Entry Fill</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10 flex items-center gap-1 font-semibold">
                                  <Check className="w-3 h-3 text-slate-400" />
                                  <span>Active in Market</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenOrderModal(play)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer text-white"
                              style={{
                                backgroundColor: 'var(--accent-subtle)',
                                border: '1px solid var(--accent-border)'
                              }}
                            >
                              <Plus className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                              <span>+ Forward-Test</span>
                            </button>
                          )}
                        </div>

                        {/* Timeframe & Trade Duration */}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Clock className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                          <span className="text-slate-200 font-medium">{play.timeframe || '1H - 4H Intraday'}</span>
                          <span>•</span>
                          <span>{play.expectedDuration || '3 - 8h'}</span>
                        </div>

                        {/* Entry, Stop Loss, 2R Take Profit Matrix */}
                        <div className="grid grid-cols-3 gap-1.5 text-center p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Trigger</div>
                            <div className="font-bold text-white truncate">{play.entryTrigger.split(' ')[0]}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">Stop Loss</div>
                            <div className="font-bold text-slate-200">{play.stopLoss}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase">2R Target</div>
                            <div className="font-bold text-slate-200">{play.target2R}</div>
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

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {watchlist.map((stock) => (
                <GlassCard key={stock.symbol} hoverEffect={false} className="p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs font-mono">{stock.symbol}</span>
                    <span className="text-[9px] text-emerald-400 font-mono">Live</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">
                    ${stock.price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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

                return (
                  <GlassCard key={mIdx} hoverEffect={false} className="p-3.5 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-7 h-7 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0"
                          style={isStrategist ? {
                            backgroundColor: 'var(--accent-primary)',
                            color: '#ffffff',
                            borderColor: 'var(--accent-border)'
                          } : isSkeptic ? {
                            backgroundColor: 'rgba(244,63,94,0.15)',
                            color: '#fda4af',
                            borderColor: 'rgba(244,63,94,0.3)'
                          } : {
                            backgroundColor: 'var(--accent-subtle)',
                            color: 'var(--accent-primary)',
                            borderColor: 'var(--accent-border)'
                          }}
                        >
                          {msg.speaker[0]}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {msg.step && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/[0.06] text-white">
                              Step {msg.step}/7
                            </span>
                          )}
                          <span className="font-bold text-white text-xs font-mono">{msg.speaker}</span>
                          <span 
                            className="text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold"
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
                        <span>{msg.timestamp || '05:30 AM'}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed pl-2 sm:pl-9 font-sans border-l-2 border-white/5 ml-3 sm:ml-0">
                      {msg.message}
                    </p>
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

      {/* 5.5 TAB: HYPERLIQUID 1-CLICK EXECUTION DESK */}
      {activeTab === 'execute' && (
        <div className="space-y-4">
          <HyperliquidDirectExecutionPanel 
            soundEnabled={soundEnabled} 
            onOrderExecuted={refreshAllData} 
          />
        </div>
      )}

      {/* 6. TAB 4: LIVE OPEN POSITIONS */}
      {activeTab === 'positions' && (
        <div className="space-y-4 font-sans">
          {/* Direct 1-Click L1 Execution Panel embedded at top of Positions */}
          <HyperliquidDirectExecutionPanel 
            soundEnabled={soundEnabled} 
            onOrderExecuted={refreshAllData} 
          />

          <div className="flex items-center justify-between pt-2">
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
              Completed Trade History & AI Reviews ({tradeJournal.length})
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
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
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
                Closed positions and manual trades will be logged here with automatic AI post-mortems.
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

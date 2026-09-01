import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  X, 
  Loader2, 
  ShieldAlert, 
  TrendingUp, 
  Target, 
  Compass, 
  Radio, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Cpu,
  Key,
  Check,
  Plus,
  Clock
} from 'lucide-react';
import { runHermesSwarmAnalysis } from '../../utils/hermesSwarmService';
import { getTradingConfig, saveTradingConfig } from '../../utils/tradingStorage';
import { enterSingleHermesPlay, getPaperPositions } from '../../utils/hermesPaperTrader';
import { playSound } from '../../utils/soundFX';

export const HermesWarRoomModal = ({ 
  isOpen, 
  onClose, 
  initialBrief, 
  onBriefUpdated, 
  soundEnabled = true 
}) => {
  const [brief, setBrief] = useState(initialBrief);
  const [config, setConfig] = useState(getTradingConfig());
  const [paperPositions, setPaperPositions] = useState(getPaperPositions());
  const [isRunningSwarm, setIsRunningSwarm] = useState(false);
  const [activeTab, setActiveTab] = useState('brief'); // 'brief' | 'logs' | 'engine'
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getTradingConfig();
      setConfig(cfg);
      setOpenRouterKeyInput(cfg.openRouterApiKey || '');
      setBrief(initialBrief);
      setPaperPositions(getPaperPositions());
      setKeySaved(false);
    }
  }, [isOpen, initialBrief]);

  const handleSaveEngineSettings = (e) => {
    if (e) e.preventDefault();
    playSound('click', soundEnabled);
    const updated = saveTradingConfig({
      ...config,
      openRouterApiKey: openRouterKeyInput.trim()
    });
    setConfig(updated);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleRunLiveSwarm = async () => {
    setIsRunningSwarm(true);
    playSound('click', soundEnabled);

    try {
      const newBrief = await runHermesSwarmAnalysis();
      setBrief(newBrief);
      if (onBriefUpdated) onBriefUpdated(newBrief);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Hermes Swarm UI error:", err);
    } finally {
      setIsRunningSwarm(false);
    }
  };

  const handleEnterIndividualPlay = (play) => {
    playSound('click', soundEnabled);
    enterSingleHermesPlay(play, brief?.date);
    setPaperPositions(getPaperPositions());
    playSound('success', soundEnabled);
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-3 sm:p-4 select-none font-sans">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/60 backdrop-blur-xl transition-all"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl theme-card border border-blue-500/25 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_30px_-5px_rgba(59,130,246,0.2)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-blue-500/15 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-950/50 border border-blue-500/25 flex items-center justify-center text-blue-400">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Hermes Autonomous Council</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300 border border-blue-500/25 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-blue-400" />
                    <span>{brief?.aiEngine || 'Nous Hermes 3 Protocol'}</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">Quantitative Synthesis & Multi-Tiered Market Scans</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunLiveSwarm}
                disabled={isRunningSwarm}
                className="px-3 py-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 text-blue-200 border border-blue-500/25 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
              >
                {isRunningSwarm ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                    <span>Run Live Sweep</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-1.5 rounded-xl bg-blue-950/30 hover:bg-blue-900/40 text-slate-400 hover:text-white transition-all border border-blue-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-2 border-b border-blue-500/10 pb-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('brief')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'brief'
                  ? 'bg-blue-500/20 text-blue-100 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Morning Brief ({brief?.highConvictionPlays?.length || 4} Setups)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-blue-500/20 text-blue-100 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Agent Council Logs ({brief?.agentLogs?.length || 4})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('engine')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'engine'
                  ? 'bg-blue-500/20 text-blue-100 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3 text-blue-400" />
              <span>Engine Settings</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans">
            {activeTab === 'brief' ? (
              <>
                {/* Macro Regime Banner */}
                <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      <span>Overnight Macro Regime</span>
                    </div>
                    <span className="text-[10px] font-mono text-blue-300/80">{brief?.date}</span>
                  </div>
                  <div className="text-xs font-bold text-white">{brief?.macroRegime || 'Neutral / Accumulation'}</div>
                  <p className="text-xs text-slate-300 leading-relaxed">{brief?.macroAnalysis}</p>
                </div>

                {/* High Conviction Plays */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-200/90 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-blue-400" />
                    <span>Tiered Plays of the Day</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(brief?.highConvictionPlays || []).map((play, idx) => {
                      const isLong = play.bias === 'LONG';
                      const isAlreadyTracking = paperPositions.some(p => p.ticker === play.ticker && p.status !== 'CLOSED');

                      return (
                        <div 
                          key={idx}
                          className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/15 space-y-2.5 hover:border-blue-500/30 transition-all"
                        >
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

                            <button
                              type="button"
                              onClick={() => handleEnterIndividualPlay(play)}
                              disabled={isAlreadyTracking}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                isAlreadyTracking
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 opacity-90'
                                  : 'bg-blue-950/40 hover:bg-blue-900/50 text-blue-200 border border-blue-500/20'
                              }`}
                            >
                              {isAlreadyTracking ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3 text-blue-400" />}
                              <span>{isAlreadyTracking ? 'Tracking' : 'Forward-Test'}</span>
                            </button>
                          </div>

                          {/* Timeframe & Trade Duration */}
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="text-blue-100 font-medium">{play.timeframe || '1H - 4H Intraday'}</span>
                            <span>•</span>
                            <span>{play.expectedDuration || '3 - 8 Hours'}</span>
                          </div>

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

                          <div className="text-xs text-slate-300 leading-relaxed">
                            <strong className="text-blue-300/80">Thesis:</strong> {play.thesis}
                          </div>

                          <div className="text-[11px] text-slate-400 pt-1 border-t border-blue-500/10">
                            <strong className="text-rose-400">Invalidation:</strong> {play.invalidation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Whale Flow Radar */}
                {brief?.whaleFlowSignals && brief.whaleFlowSignals.length > 0 && (
                  <div className="p-3 rounded-2xl bg-blue-950/30 border border-blue-500/15 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-300/80 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-blue-400" />
                      <span>Poseidon Flow Radar (Whale Prints)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {brief.whaleFlowSignals.map((flow, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/10 text-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white font-mono">{flow.asset}</span>
                            <span className="text-[10px] text-blue-300/70 font-mono">{flow.type}</span>
                          </div>
                          <p className="text-[11px] text-slate-300">{flow.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : activeTab === 'logs' ? (
              /* Agent Council Logs View */
              <div className="space-y-2.5">
                {(brief?.agentLogs || []).map((log, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-blue-950/30 border border-blue-500/15 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">{log.agent}</span>
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{log.status}</span>
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px]">{log.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              /* Engine Settings */
              <form onSubmit={handleSaveEngineSettings} className="space-y-4">
                <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-bold text-white">Nous Research Hermes 3 Configuration</h4>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Runs multi-agent quantitative chain-of-thought to cross-examine liquidity, volume delta, and risk.
                  </p>

                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        OpenRouter API Key (Optional)
                      </label>
                      <input
                        type="password"
                        value={openRouterKeyInput}
                        onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                        placeholder="Leave blank to use Gemini Engine (Free)"
                        className="w-full px-3 py-2 rounded-xl bg-blue-950/50 border border-blue-500/20 text-white font-mono text-xs outline-none focus:border-blue-400"
                      />
                      <div className="text-[10px] text-slate-500 mt-1">
                        By default, the council runs the Hermes 3 reasoning protocol via your free Google Gemini setup with $0 cost.
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer bg-blue-600 hover:bg-blue-500"
                >
                  {keySaved ? <Check className="w-4 h-4 text-emerald-400" /> : <Key className="w-4 h-4" />}
                  <span>{keySaved ? 'Settings Saved' : 'Save Configuration'}</span>
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

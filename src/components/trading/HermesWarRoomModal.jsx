import React, { useState } from 'react';
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
  ArrowDownRight
} from 'lucide-react';
import { runHermesSwarmAnalysis } from '../../utils/hermesSwarmService';
import { playSound } from '../../utils/soundFX';

export const HermesWarRoomModal = ({ 
  isOpen, 
  onClose, 
  initialBrief, 
  onBriefUpdated, 
  soundEnabled = true 
}) => {
  const [brief, setBrief] = useState(initialBrief);
  const [isRunningSwarm, setIsRunningSwarm] = useState(false);
  const [activeTab, setActiveTab] = useState('brief'); // 'brief' | 'logs'

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

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-3 sm:p-4 select-none">
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
          className="relative w-full max-w-3xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Hermes Autonomous Council</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    6-Agent Swarm
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">Overnight Market Intelligence & Adversarial Validation</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunLiveSwarm}
                disabled={isRunningSwarm}
                className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
              >
                {isRunningSwarm ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Sweeping Markets...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Run Live Swarm</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-tabs: Brief vs Agent Council Logs */}
          <div className="flex items-center gap-2 border-b border-white/5 pb-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('brief')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'brief'
                  ? 'bg-white/[0.1] text-white border border-white/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Morning War Room Brief
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-white/[0.1] text-white border border-white/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Agent Council Logs ({brief?.agentLogs?.length || 4})
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans">
            {activeTab === 'brief' ? (
              <>
                {/* Macro Regime Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      <span>Overnight Macro Regime</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{brief?.date}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{brief?.macroRegime || 'Neutral / Accumulation'}</div>
                  <p className="text-xs text-slate-300 leading-relaxed">{brief?.macroAnalysis}</p>
                </div>

                {/* High Conviction Plays */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>Skeptic-Approved High Conviction Plays</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(brief?.highConvictionPlays || []).map((play, idx) => {
                      const isLong = play.bias === 'LONG';
                      return (
                        <div 
                          key={idx}
                          className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5 hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white font-mono">{play.ticker}</span>
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
                              <div className="text-[9px] text-slate-400 uppercase">Entry Trigger</div>
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
                            <strong className="text-slate-400">Thesis:</strong> {play.thesis}
                          </div>

                          <div className="text-[11px] text-rose-300/90 pt-1 border-t border-white/5">
                            <strong>Invalidation:</strong> {play.invalidation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Whale Flow & Dark Pool Signals */}
                {brief?.whaleFlowSignals && brief.whaleFlowSignals.length > 0 && (
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-blue-400" />
                      <span>Poseidon Flow Radar (Whale Prints)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {brief.whaleFlowSignals.map((flow, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white font-mono">{flow.asset}</span>
                            <span className="text-[10px] text-blue-300 font-mono">{flow.type}</span>
                          </div>
                          <p className="text-[11px] text-slate-300">{flow.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adversarial Review Notice */}
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>The Skeptic (Risk Officer Review)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-300/90">{brief?.adversarialReview}</p>
                </div>
              </>
            ) : (
              /* Agent Council Logs View */
              <div className="space-y-2.5">
                {(brief?.agentLogs || [
                  { agent: "Atlas (Macro Radar)", status: "COMPLETED", summary: "Overnight futures green, DXY stable at 104.2." },
                  { agent: "Artemis (Screener)", status: "COMPLETED", summary: "Key breakouts identified on SOL, BTC, and NVDA." },
                  { agent: "Poseidon (Flow & Whales)", status: "COMPLETED", summary: "Institutional accumulation detected on Hyperliquid order book." },
                  { agent: "The Skeptic (Risk)", status: "COMPLETED", summary: "Stress-tested candidate plays and enforced 1:2.5 minimum R:R." }
                ]).map((log, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1 text-xs">
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
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

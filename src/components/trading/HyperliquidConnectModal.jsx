import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Key, 
  X, 
  Check, 
  ShieldCheck, 
  ExternalLink, 
  Loader2, 
  Lock, 
  Sliders,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { getTradingConfig, saveTradingConfig } from '../../utils/tradingStorage';
import { fetchHyperliquidAccount } from '../../utils/hyperliquidService';
import { playSound } from '../../utils/soundFX';

export const HyperliquidConnectModal = ({ 
  isOpen, 
  onClose, 
  onConfigSaved, 
  soundEnabled = true 
}) => {
  const [config, setConfig] = useState(getTradingConfig());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getTradingConfig();
      setConfig(current);
      setTestResult(null);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    playSound('click', soundEnabled);

    try {
      const res = await fetchHyperliquidAccount(config.agentWalletAddress, config.testnet);
      setTestResult({
        success: true,
        accountValue: res.accountValue,
        positionsCount: res.positions?.length || 0
      });
      playSound('success', soundEnabled);
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Could not verify Hyperliquid address.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = (e) => {
    if (e) e.preventDefault();
    playSound('click', soundEnabled);
    const updated = saveTradingConfig(config);
    setSavedSuccess(true);
    if (onConfigSaved) onConfigSaved(updated);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
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
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Hyperliquid Direct L1 Bridge</h3>
                <div className="text-[11px] text-slate-400">Zero-Middleware Execution & Risk Engine</div>
              </div>
            </div>

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

          {/* Security Notice */}
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Non-Custodial Trade-Only Agent Key</span>
            </div>
            <p className="text-[11px] text-emerald-200/80 leading-relaxed">
              Hyperliquid Agent Keys have <strong>zero withdrawal permissions</strong>. Your funds cannot be moved out of your account.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveConfig} className="space-y-3.5 flex-1 overflow-y-auto pr-1">
            {/* Agent Wallet Address */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Hyperliquid Wallet Address (or Agent Address)
              </label>
              <input
                type="text"
                value={config.agentWalletAddress}
                onChange={(e) => setConfig(prev => ({ ...prev, agentWalletAddress: e.target.value.trim() }))}
                placeholder="0x..."
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none focus:border-white/30"
              />
            </div>

            {/* Agent Private Key */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Agent Private Key (Optional for Local Live Execution)
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={config.agentPrivateKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, agentPrivateKey: e.target.value.trim() }))}
                  placeholder="0x... (Leaves blank to use Simulated Mode)"
                  className="w-full pl-3 pr-8 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none focus:border-white/30"
                />
                <Lock className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            {/* Network & Risk Settings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Risk % Per Trade</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="10"
                  value={config.defaultRiskPercent}
                  onChange={(e) => setConfig(prev => ({ ...prev, defaultRiskPercent: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Max Leverage Cap</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={config.maxLeverage}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxLeverage: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Daily Loss Limit ($)</label>
                <input
                  type="number"
                  step="50"
                  value={config.maxDailyLossLimitUSD}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxDailyLossLimitUSD: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            {/* Test Connection Result */}
            {testResult && (
              <div className={`p-2.5 rounded-xl border text-xs ${
                testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}>
                {testResult.success ? (
                  <div className="flex items-center justify-between">
                    <span>Verified Hyperliquid Account!</span>
                    <strong className="font-mono">${testResult.accountValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} Equity</strong>
                  </div>
                ) : (
                  <div>{testResult.error}</div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !config.agentWalletAddress}
                className="px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-30"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                <span>Test Connection</span>
              </button>

              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Saved Successfully</span>
                  </>
                ) : (
                  <span>Save Hyperliquid Bridge</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Radio, 
  X, 
  Copy, 
  Check, 
  Send, 
  Sparkles, 
  Layers, 
  ExternalLink,
  Code,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Bot
} from 'lucide-react';
import { executeHyperliquidSignal } from '../../utils/hyperliquidService';
import { playSound } from '../../utils/soundFX';

export const WebhookConfigModal = ({ 
  isOpen, 
  onClose, 
  onSignalExecuted, 
  soundEnabled = true 
}) => {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhook/tradingview`
    : 'https://wolfe-os.vercel.app/api/webhook/tradingview';

  const alertMessageJson = {
    strategy_id: "My_TradingView_Strategy",
    stock_id: "BTC-USD:HYPERLIQUID",
    action: "{{strategy.market_position}}",
    contracts: "{{strategy.order.contracts}}",
    price: "{{strategy.order.price}}",
    leverage: 1,
    pyramiding: 3,
    api_token: "wolfe_wh_live_auth"
  };

  const payloadString = JSON.stringify(alertMessageJson, null, 2);

  const handleCopyUrl = () => {
    playSound('click', soundEnabled);
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const handleCopyPayload = () => {
    playSound('click', soundEnabled);
    navigator.clipboard.writeText(payloadString).then(() => {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    });
  };

  const handleSendTestSignal = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    playSound('click', soundEnabled);

    try {
      const res = await executeHyperliquidSignal({
        stock_id: 'BTC-USD:HYPERLIQUID',
        action: 'long',
        price: 77336.50,
        leverage: 1,
        strategy: 'TradingView Alert (Test Ping)',
        source: 'TradingView Webhook Test'
      });

      setTestResult({
        success: true,
        contracts: res.sizing.contracts,
        notional: res.sizing.notionalValueUSD,
        margin: res.sizing.requiredMarginUSD,
        risk: res.sizing.riskUSD
      });

      if (onSignalExecuted) onSignalExecuted(res.position);
      playSound('success', soundEnabled);
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Execution error'
      });
    } finally {
      setIsSendingTest(false);
    }
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
          className="relative w-full max-w-xl theme-card rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col font-sans"
          style={{ 
            border: '1px solid var(--accent-border)',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.8), 0 0 35px -5px var(--accent-glow)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div 
                className="w-9 h-9 rounded-2xl border flex items-center justify-center"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">TradingView Webhook Automation</h3>
                <div className="text-[11px] text-slate-400">Direct Alert Bridge (100% Automated by Pine Script)</div>
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

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans text-xs">
            {/* 1. Webhook URL Section */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">
                1. Webhook URL (Paste into TradingView Alert Settings)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-slate-200 font-mono text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
            </div>

            {/* 2. Alert Message Body (JSON) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  2. Alert Message (Paste into TradingView Message Box)
                </label>
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload ? 'Copied JSON' : 'Copy JSON'}</span>
                </button>
              </div>

              <pre className="p-3 rounded-2xl bg-black/60 border border-white/10 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto select-all">
                {payloadString}
              </pre>
            </div>

            {/* 3. Explanation & How Pine Script Handles Everything */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2 text-slate-300">
              <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span>How It Works (Zero Manual Work)</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400 list-disc pl-4 leading-relaxed">
                <li>TradingView Pine Script automatically handles all entry signals, exits, position sizing, and stop levels on the chart.</li>
                <li>When an alert triggers, TradingView sends the message directly to your Wolfe OS cloud endpoint in <strong>&lt; 100ms</strong>.</li>
                <li>Wolfe OS receives the signal, verifies authentication, and submits the order directly to Hyperliquid L1.</li>
              </ul>
            </div>

            {/* 4. Test Webhook Connection */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                Test the webhook execution bridge:
              </div>
              <button
                type="button"
                onClick={handleSendTestSignal}
                disabled={isSendingTest}
                className="px-3 py-1.5 rounded-xl font-semibold text-white flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50 text-xs"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingTest ? 'Sending Test...' : 'Send Test Ping'}</span>
              </button>
            </div>

            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-2xl border text-xs font-mono flex items-center justify-between ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                }`}
              >
                {testResult.success ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Webhook Received & Executed: BTC ({testResult.contracts} contracts, ${testResult.margin} margin)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-rose-400" />
                    <span>Test Failed: {testResult.error}</span>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

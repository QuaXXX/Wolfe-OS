import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Radio, 
  X, 
  Copy, 
  Check, 
  Play, 
  Send, 
  Sparkles, 
  Layers, 
  ExternalLink,
  Code
} from 'lucide-react';
import { executeHyperliquidSignal } from '../../utils/hyperliquidService';
import { playSound } from '../../utils/soundFX';

export const WebhookConfigModal = ({ 
  isOpen, 
  onClose, 
  onSignalExecuted, 
  soundEnabled = true 
}) => {
  const [schemaMode, setSchemaMode] = useState('alphainsider'); // 'alphainsider' | 'standard'
  const [ticker, setTicker] = useState('BTC');
  const [action, setAction] = useState('BUY');
  const [price, setPrice] = useState(77336.50);
  const [stopLoss, setStopLoss] = useState(75800);
  const [takeProfit, setTakeProfit] = useState(80200);
  const [strategy, setStrategy] = useState('4H Trend Reclaim');
  const [riskPercent, setRiskPercent] = useState(1.5);
  const [leverage, setLeverage] = useState(1);
  const [pyramiding, setPyramiding] = useState(3);
  const [strategyId, setStrategyId] = useState('A3gBJqqMfV_B5uHNE-mDt');

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhook/tradingview`
    : 'https://wolfe-os.vercel.app/api/webhook/tradingview';

  const alphaInsiderPayloadJson = {
    strategy_id: strategyId,
    stock_id: `${ticker}-USD:HYPERLIQUID`,
    action: "{{strategy.market_position}}",
    leverage: leverage,
    pyramiding: pyramiding,
    api_token: "wolfe_wh_live_auth"
  };

  const standardPayloadJson = {
    ticker,
    action,
    price,
    stopLoss,
    takeProfit,
    riskPercent,
    leverage,
    strategy,
    timestamp: "{{time}}"
  };

  const payloadString = schemaMode === 'alphainsider'
    ? JSON.stringify(alphaInsiderPayloadJson, null, 2)
    : JSON.stringify(standardPayloadJson, null, 2);

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
      const signalPayload = schemaMode === 'alphainsider'
        ? {
            stock_id: `${ticker}-USD:HYPERLIQUID`,
            action: 'long',
            price,
            leverage,
            strategy: strategyId,
            source: 'TradingView (AlphaInsider Drop-in Test)'
          }
        : {
            ticker,
            action,
            price,
            stopLoss,
            takeProfit,
            riskPercent,
            leverage,
            strategy,
            source: 'TradingView Test Modal'
          };

      const res = await executeHyperliquidSignal(signalPayload);

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
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">TradingView 24/7 Webhook Bridge</h3>
                <div className="text-[11px] text-slate-400">Direct Alert Automation (Replaces AlphaInsider)</div>
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
            {/* 1. Webhook URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">
                TradingView Alert Webhook URL (Paste into TradingView Alert Settings)
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
                  className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
            </div>

            {/* 2. Schema Mode Selector */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => setSchemaMode('alphainsider')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  schemaMode === 'alphainsider'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={schemaMode === 'alphainsider' ? {
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                } : {}}
              >
                ⚡ AlphaInsider Drop-in Schema
              </button>
              <button
                type="button"
                onClick={() => setSchemaMode('standard')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  schemaMode === 'standard'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={schemaMode === 'standard' ? {
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                } : {}}
              >
                Wolfe OS Standard Schema
              </button>
            </div>

            {/* 3. Interactive Alert Payload Generator */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="font-bold text-white flex items-center justify-between">
                <span>{schemaMode === 'alphainsider' ? 'AlphaInsider Compatible Alert Format' : 'Customize Alert Parameters'}</span>
                <span className="text-[10px] font-mono text-slate-400">Zero Code Change Required</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Ticker</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Action</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs"
                  >
                    <option value="BUY">BUY / LONG</option>
                    <option value="SELL">SELL / SHORT</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Entry Price ($)</label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Stop Loss ($)</label>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-xs"
                  />
                </div>
              </div>

              {/* JSON Payload Preview & Copy */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">TradingView Message Body (JSON):</span>
                  <button
                    type="button"
                    onClick={handleCopyPayload}
                    className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPayload ? 'Copied Message JSON' : 'Copy Message Body'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono text-emerald-300/90 overflow-x-auto">
                  {payloadString}
                </pre>
              </div>
            </div>

            {/* Test Result Box */}
            {testResult && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Execution Successful!</span>
                </div>
                <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-emerald-200/90 pt-1">
                  <div>Contracts: <strong>{testResult.contracts}</strong></div>
                  <div>Notional: <strong>${testResult.notional}</strong></div>
                  <div>Margin: <strong>${testResult.margin}</strong></div>
                  <div>Risk: <strong>${testResult.risk}</strong></div>
                </div>
              </div>
            )}

            {/* Test Signal Button */}
            <button
              type="button"
              onClick={handleSendTestSignal}
              disabled={isSendingTest}
              className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingTest ? 'Executing Signal...' : 'Simulate & Fire Live Test Webhook'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

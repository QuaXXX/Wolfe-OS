import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Wallet, 
  Radio, 
  XOctagon, 
  Terminal,
  Copy,
  Check
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { getTradingConfig } from '../../utils/tradingStorage';
import { submitHyperliquidSignedOrder, getHyperliquidMeta } from '../../utils/hyperliquidSigning';
import { playSound } from '../../utils/soundFX';

export const HyperliquidDirectExecutionPanel = ({ soundEnabled = true, onOrderExecuted }) => {
  const [ticker, setTicker] = useState('BTC');
  const [leverage, setLeverage] = useState(3);
  const [liveEquity, setLiveEquity] = useState(null);
  const [withdrawable, setWithdrawable] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const [executionLogs, setExecutionLogs] = useState([]);
  const [lastError, setLastError] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);
  const [copiedMaster, setCopiedMaster] = useState(false);

  const config = getTradingConfig();
  const masterWallet = config.masterWalletAddress || '0x5bB10c46b7CF48126CC1bb4a103a9c8cDfF30DC7';
  const [perpsEquity, setPerpsEquity] = useState(0);
  const [spotEquity, setSpotEquity] = useState(0);
  const [enableSl, setEnableSl] = useState(true);
  const [slPercent, setSlPercent] = useState(2);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setExecutionLogs(prev => [{ timestamp, msg, type }, ...prev.slice(0, 15)]);
  };

  const fetchLiveState = async () => {
    setIsLoadingBalance(true);
    addLog(`Fetching live state for Master: ${masterWallet.slice(0, 8)}...`, 'info');
    
    try {
      let perpsVal = 0;
      let spotVal = 0;

      // 1. Fetch Clearinghouse Balance (Perps)
      try {
        const res = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'clearinghouseState', user: masterWallet })
        });
        if (res.ok) {
          const data = await res.json();
          perpsVal = Number(data.crossMarginSummary?.accountValue || data.marginSummary?.accountValue || 0);
          setWithdrawable(Number(data.withdrawable || 0));
        }
      } catch (err) {
        console.warn("Perps fetch warning:", err);
      }

      // 2. Fetch Spot Balances
      try {
        const spotRes = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'spotClearinghouseState', user: masterWallet })
        });
        if (spotRes.ok) {
          const spotData = await spotRes.json();
          if (spotData.balances && Array.isArray(spotData.balances)) {
            const usdc = spotData.balances.find(b => b.coin === 'USDC');
            if (usdc) {
              spotVal = Number(usdc.total || usdc.hold || 0);
            }
          }
        }
      } catch (err) {
        console.warn("Spot fetch warning:", err);
      }

      setPerpsEquity(perpsVal);
      setSpotEquity(spotVal);
      const totalVal = perpsVal > 0 ? perpsVal : spotVal;
      setLiveEquity(totalVal);
      addLog(`Balances: Perps = $${perpsVal.toFixed(2)} USDC | Spot = $${spotVal.toFixed(2)} USDC`, 'success');

      // 3. Fetch Live Price & Meta
      const metaData = await getHyperliquidMeta();
      if (metaData) {
        const assetIdx = metaData.universe.findIndex(u => u.name === ticker);
        if (assetIdx >= 0) {
          const ctx = metaData.assetCtxs[assetIdx];
          const px = Number(ctx?.midPx || ctx?.markPx || 0);
          setLivePrice(px);
          addLog(`Live ${ticker} Mid Price: $${px.toFixed(2)}`, 'info');
        }
      }
    } catch (err) {
      addLog(`Error querying Hyperliquid: ${err.message}`, 'error');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    fetchLiveState();
    const interval = setInterval(fetchLiveState, 15000);
    return () => clearInterval(interval);
  }, [ticker]);

  const handleExecute100PctOrder = async (actionType) => {
    setIsExecuting(true);
    setLastError(null);
    setLastSuccess(null);
    playSound('click', soundEnabled);

    const isBuy = actionType === 'BUY';
    const isClose = actionType === 'FLAT';

    addLog(`Initiating 100% Wallet ${actionType} on ${ticker}...`, 'info');

    try {
      addLog(`Sending verified 100% ${actionType} order to Wolfe OS L1 Execution Engine...`, 'info');

      const action = isClose ? 'flat' : (isBuy ? 'buy' : 'sell');
      const response = await fetch('/api/webhook/tradingview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          action,
          percent_of_equity: 100,
          leverage,
          sl_percent: (!isClose && enableSl) ? slPercent : null,
          api_token: 'wolfe_wh_live_auth'
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Serverless Execution Failed');
      }

      // Check if Hyperliquid returned an on-chain status error inside statuses
      const onChainData = data.onChainResult?.response?.data?.statuses?.[0];
      if (onChainData?.error) {
        throw new Error(`Hyperliquid L1 Rejected: ${onChainData.error}`);
      }

      const fillInfo = onChainData?.filled || {};
      const filledSz = fillInfo.totalSz || data.execution?.executedContracts;
      const avgPx = fillInfo.avgPx || data.execution?.entryPrice;

      addLog(`✓ FILLED ON HYPERLIQUID L1! ${actionType} ${filledSz} ${ticker} @ $${avgPx}`, 'success');

      if (data.onChainResult?.stopLossResult?.status === 'ok') {
        addLog(`✓ Stop Loss Active on Hyperliquid L1 (${slPercent}% buffer)`, 'success');
      }

      setLastSuccess({
        action: actionType,
        ticker,
        contracts: filledSz,
        price: avgPx,
        raw: data
      });
      playSound('success', soundEnabled);

      if (onOrderExecuted) onOrderExecuted();
      setTimeout(fetchLiveState, 1500);
    } catch (err) {
      console.error("Manual Hyperliquid Execution Error:", err);
      const errorMsg = err.message || JSON.stringify(err);
      addLog(`❌ Hyperliquid Execution Failed: ${errorMsg}`, 'error');
      setLastError(errorMsg);
      playSound('click', soundEnabled);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyMaster = () => {
    playSound('click', soundEnabled);
    navigator.clipboard.writeText(masterWallet).then(() => {
      setCopiedMaster(true);
      setTimeout(() => setCopiedMaster(false), 2000);
    });
  };

  return (
    <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-4 font-sans border-white/10">
      {/* Header & Wallet Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div 
            className="w-9 h-9 rounded-2xl border flex items-center justify-center font-bold text-white shadow-sm"
            style={{ 
              backgroundColor: 'var(--accent-subtle)',
              borderColor: 'var(--accent-border)',
              color: 'var(--accent-primary)'
            }}
          >
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Hyperliquid 1-Click L1 Execution</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Agent Connected</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Master: <strong className="text-slate-200 font-mono">{masterWallet.slice(0, 6)}...{masterWallet.slice(-4)}</strong></span>
              <button 
                type="button" 
                onClick={handleCopyMaster}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Copy Master Wallet Address"
              >
                {copiedMaster ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Live Balance Pills & Refresh */}
        <div className="flex items-center gap-2 font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-right">
            <div className="text-[9px] text-slate-400 uppercase">Perps Balance</div>
            <div className={`text-xs font-bold ${perpsEquity > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              ${perpsEquity.toFixed(2)}
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-right">
            <div className="text-[9px] text-slate-400 uppercase">Spot Balance</div>
            <div className={`text-xs font-bold ${spotEquity > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              ${spotEquity.toFixed(2)}
            </div>
          </div>

          <button
            type="button"
            onClick={fetchLiveState}
            disabled={isLoadingBalance}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer disabled:opacity-50"
            title="Refresh Live Balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalance ? 'animate-spin text-white' : ''}`} />
          </button>
        </div>
      </div>

      {/* Spot to Perps Transfer Reminder Banner (if funds are in Spot but Perps is 0) */}
      {perpsEquity === 0 && spotEquity > 0 && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs font-sans flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-300">Your ${spotEquity.toFixed(2)} USDC is in your Spot Account</div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Hyperliquid BTC perps orders execute from your <strong>Perps Account</strong>. On <a href="https://app.hyperliquid.xyz/trade" target="_blank" rel="noreferrer" className="underline text-amber-300 font-semibold hover:text-white">app.hyperliquid.xyz</a>, click <strong>"Transfer"</strong> to move your USDC from Spot ➔ Perps with 1 click (free & instant).
            </p>
          </div>
        </div>
      )}

      {/* Asset, Leverage & Price Controls */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Asset</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
          >
            <option value="BTC">BTC (Bitcoin)</option>
            <option value="SOL">SOL (Solana)</option>
            <option value="ETH">ETH (Ethereum)</option>
            <option value="SUI">SUI</option>
            <option value="HYPE">HYPE</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Leverage</label>
          <div className="grid grid-cols-3 gap-1 font-mono">
            {[1, 3, 5].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  leverage === lev
                    ? 'bg-white/20 text-white border-white/30'
                    : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Live Mid Price</label>
          <div className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono font-bold text-xs">
            {livePrice ? `$${livePrice.toLocaleString()}` : 'Fetching...'}
          </div>
        </div>
      </div>

      {/* Stop Loss Auto-Protection Selector */}
      <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enableSl}
              onChange={(e) => setEnableSl(e.target.checked)}
              className="rounded accent-emerald-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Auto Stop Loss Protection on Hyperliquid</span>
          </label>
          <span className="text-[10px] font-mono text-slate-400">
            {enableSl && livePrice ? `SL Trigger: ~$${(livePrice * (1 - slPercent / 100)).toFixed(1)} (-${slPercent}%)` : 'Off'}
          </span>
        </div>

        {enableSl && (
          <div className="grid grid-cols-4 gap-1.5 font-mono text-xs pt-0.5">
            {[1, 2, 3, 5].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSlPercent(pct)}
                className={`py-1 rounded-xl font-bold border transition-all cursor-pointer ${
                  slPercent === pct
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                -{pct}% SL
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3 Direct 100% Wallet Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        {/* Button 1: 100% BUY / LONG */}
        <button
          type="button"
          onClick={() => handleExecute100PctOrder('BUY')}
          disabled={isExecuting}
          className="p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs flex items-center gap-1 text-white">
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-300" />
              <span>BUY 100% Wallet</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
              {leverage}x Long
            </span>
          </div>
          <div className="text-[10px] text-slate-400 text-left">
            Opens Long at market using 100% of USDC
          </div>
        </button>

        {/* Button 2: 100% SELL / SHORT */}
        <button
          type="button"
          onClick={() => handleExecute100PctOrder('SELL')}
          disabled={isExecuting}
          className="p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs flex items-center gap-1 text-white">
              <ArrowDownRight className="w-3.5 h-3.5 text-slate-300" />
              <span>SELL 100% Wallet</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
              {leverage}x Short
            </span>
          </div>
          <div className="text-[10px] text-slate-400 text-left">
            Opens Short at market using 100% of USDC
          </div>
        </button>

        {/* Button 3: FLAT / CLOSE */}
        <button
          type="button"
          onClick={() => handleExecute100PctOrder('FLAT')}
          disabled={isExecuting}
          className="p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs flex items-center gap-1 text-white">
              <XOctagon className="w-3.5 h-3.5 text-slate-300" />
              <span>FLAT / CLOSE</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
              ReduceOnly
            </span>
          </div>
          <div className="text-[10px] text-slate-400 text-left">
            Closes all open {ticker} contracts immediately
          </div>
        </button>
      </div>

      {/* Success Notification Box */}
      {lastSuccess && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs font-mono space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>✓ Order Executed on Hyperliquid L1!</span>
          </div>
          <div className="text-[11px] text-slate-300">
            {lastSuccess.action} {lastSuccess.contracts} {lastSuccess.ticker} @ ${lastSuccess.price}
          </div>
        </div>
      )}

      {/* Prominent Raw Error Message Box */}
      {lastError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-mono space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Hyperliquid L1 Error Diagnostic:</span>
          </div>
          <pre className="p-2.5 rounded-xl bg-black/60 border border-rose-500/20 text-[11px] text-rose-200 overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
            {lastError}
          </pre>
        </div>
      )}

      {/* Live Execution Diagnostic Console */}
      <div className="p-3 rounded-2xl bg-black/50 border border-white/10 space-y-2 font-mono text-[11px]">
        <div className="flex items-center justify-between text-slate-400 text-[10px]">
          <span className="flex items-center gap-1 font-bold text-slate-300">
            <Terminal className="w-3 h-3 text-slate-400" />
            <span>Live L1 Order Execution Console</span>
          </span>
          <span>{executionLogs.length} events logged</span>
        </div>

        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
          {executionLogs.length === 0 ? (
            <div className="text-slate-500 text-[10px] italic">Ready for execution test...</div>
          ) : (
            executionLogs.map((log, idx) => (
              <div 
                key={idx} 
                className={`text-[10px] leading-tight flex items-start gap-2 ${
                  log.type === 'error' 
                    ? 'text-rose-400 font-semibold' 
                    : log.type === 'success' 
                    ? 'text-emerald-400' 
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span className="flex-1">{log.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </GlassCard>
  );
};

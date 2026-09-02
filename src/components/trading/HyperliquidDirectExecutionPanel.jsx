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
  Check,
  Percent,
  TrendingUp,
  Target,
  Sliders,
  Sparkles
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { getTradingConfig } from '../../utils/tradingStorage';
import { getHyperliquidMeta } from '../../utils/hyperliquidSigning';
import { playSound } from '../../utils/soundFX';

export const HyperliquidDirectExecutionPanel = ({ 
  initialTicker = 'BTC', 
  initialLeverage = 3, 
  scannedSetups = [],
  soundEnabled = true, 
  onOrderExecuted 
}) => {
  const [ticker, setTicker] = useState(initialTicker);
  const [leverage, setLeverage] = useState(initialLeverage);
  const [sizePercent, setSizePercent] = useState(100);

  useEffect(() => {
    if (initialTicker) setTicker(initialTicker);
  }, [initialTicker]);
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
  const [confirmAction, setConfirmAction] = useState(null);
  
  // Risk & Target Controls
  const [enableSl, setEnableSl] = useState(true);
  const [slPercent, setSlPercent] = useState(2);
  const [enableTp, setEnableTp] = useState(true);
  const [tpPercent, setTpPercent] = useState(4);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setExecutionLogs(prev => [{ timestamp, msg, type }, ...prev.slice(0, 15)]);
  };

  const handleApplySetup = (setup) => {
    playSound('click', soundEnabled);
    setTicker(setup.ticker);
    setLeverage(setup.leverage || 5);
    setSizePercent(100);
    setEnableSl(true);
    setSlPercent(2);
    setEnableTp(true);
    setTpPercent(4);
    addLog(`✓ Loaded Scanned Setup: ${setup.ticker} (${setup.bias || 'LONG'}) • 5x Leverage • 2% SL / 4% TP. Ready to confirm.`, 'success');
  };

  const fetchLiveState = async (silent = false) => {
    setIsLoadingBalance(true);
    if (!silent) {
      addLog(`Fetching live state for Master: ${masterWallet.slice(0, 8)}...`, 'info');
    }
    
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
      if (!silent) {
        addLog(`Balances: Perps = $${perpsVal.toFixed(2)} USDC | Spot = $${spotVal.toFixed(2)} USDC`, 'success');
      }

      // 3. Fetch Live Price & Meta
      const metaData = await getHyperliquidMeta();
      if (metaData) {
        const assetIdx = metaData.universe.findIndex(u => u.name === ticker);
        if (assetIdx >= 0) {
          const ctx = metaData.assetCtxs[assetIdx];
          const px = Number(ctx?.midPx || ctx?.markPx || 0);
          setLivePrice(px);
          if (!silent) {
            addLog(`Live ${ticker} Mid Price: $${px.toFixed(2)}`, 'info');
          }
        }
      }
    } catch (err) {
      if (!silent) {
        addLog(`Error querying Hyperliquid: ${err.message}`, 'error');
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    fetchLiveState(false);
    const interval = setInterval(() => fetchLiveState(true), 15000);
    return () => clearInterval(interval);
  }, [ticker]);

  // Projected Sizing Calculations
  const availableMarginUSD = perpsEquity > 0 ? perpsEquity : (spotEquity > 0 ? spotEquity : 100);
  const allocatedMarginUSD = (availableMarginUSD * (sizePercent / 100));
  const notionalPositionUSD = allocatedMarginUSD * leverage;
  const currentPrice = livePrice || 77400;
  const projectedContracts = currentPrice > 0 ? (notionalPositionUSD / currentPrice) : 0;

  // Projected Risk & Reward
  const projectedLossUSD = (notionalPositionUSD * (slPercent / 100));
  const projectedProfitUSD = (notionalPositionUSD * (tpPercent / 100));
  const projectedLossRoi = slPercent * leverage;
  const projectedProfitRoi = tpPercent * leverage;

  const handleExecuteOrder = async (actionType) => {
    setIsExecuting(true);
    setLastError(null);
    setLastSuccess(null);
    playSound('click', soundEnabled);

    const isBuy = actionType === 'BUY';
    const isClose = actionType === 'FLAT';

    addLog(`Initiating ${isClose ? 'FLAT' : `${sizePercent}% ${actionType}`} on ${ticker}...`, 'info');

    try {
      addLog(`Sending verified order to Wolfe OS L1 Execution Engine...`, 'info');

      const action = isClose ? 'flat' : (isBuy ? 'buy' : 'sell');
      const response = await fetch('/api/webhook/tradingview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          action,
          percent_of_equity: sizePercent,
          leverage,
          sl_percent: (!isClose && enableSl) ? slPercent : null,
          tp_percent: (!isClose && enableTp) ? tpPercent : null,
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
        addLog(`✓ Position Stop Loss Active on Hyperliquid L1 (-${slPercent}% trigger)`, 'success');
      }
      if (data.onChainResult?.takeProfitResult?.status === 'ok') {
        addLog(`✓ Position Take Profit Active on Hyperliquid L1 (+${tpPercent}% trigger)`, 'success');
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
    navigator.clipboard.writeText(masterWallet);
    setCopiedMaster(true);
    setTimeout(() => setCopiedMaster(false), 2000);
  };

  return (
    <GlassCard className="p-3.5 sm:p-4 border-white/10 space-y-3.5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white/10 text-white border border-white/15">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">Hyperliquid Desk</h3>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                L1 Live
              </span>
            </div>
          </div>
        </div>

        {/* Live Balance Cards */}
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
            onClick={() => fetchLiveState(false)}
            disabled={isLoadingBalance}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer disabled:opacity-50"
            title="Refresh Live Balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalance ? 'animate-spin text-white' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scanned Strategy Setups Quick-Loader */}
      {scannedSetups && scannedSetups.length > 0 && (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5 text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Scanned Strategy Setups</span>
            </span>
            <span className="text-[10px] text-slate-400">Click to Auto-Configure</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
            {scannedSetups.map((setup, idx) => {
              const isSelected = ticker === setup.ticker;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplySetup(setup)}
                  className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-sm' 
                      : 'bg-black/30 border-white/5 text-slate-300 hover:text-white hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{setup.ticker}</span>
                    <span className={`text-[9px] px-1 py-0.2 rounded font-sans ${setup.bias === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {setup.bias || 'LONG'}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 truncate mt-0.5 font-sans">
                    Grade {setup.convictionGrade || 'A+'} • 5x Lev
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Row 1: Asset Selection & Live Price */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Trading Asset</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
          >
            <option value="BTC">BTC (Bitcoin Perp)</option>
            <option value="SOL">SOL (Solana Perp)</option>
            <option value="ETH">ETH (Ethereum Perp)</option>
            <option value="SUI">SUI (Sui Perp)</option>
            <option value="HYPE">HYPE (Hyperliquid Perp)</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Live Mark / Mid Price</label>
          <div className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono font-bold text-xs flex items-center justify-between">
            <span>{livePrice ? `$${livePrice.toLocaleString()}` : 'Fetching...'}</span>
            <span className="text-[10px] text-emerald-400">Live Feed</span>
          </div>
        </div>
      </div>

      {/* Row 2: Account Sizing Scale & Leverage Scale */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Sizing Scale */}
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-blue-400" />
              <span>Position Sizing</span>
            </span>
            <span className="font-mono font-bold text-blue-400">{sizePercent}% Equity</span>
          </div>

          <div className="grid grid-cols-4 gap-1 font-mono text-xs">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSizePercent(pct)}
                className={`py-1 rounded-xl font-bold border transition-all cursor-pointer ${
                  sizePercent === pct
                    ? 'bg-blue-500/25 text-blue-300 border-blue-500/40 shadow-sm'
                    : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Sizing Breakdown Details */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5 border-t border-white/5">
            <span>Margin: <strong className="text-white">${allocatedMarginUSD.toFixed(2)}</strong></span>
            <span>Notional: <strong className="text-white">${notionalPositionUSD.toFixed(2)}</strong></span>
            <span>Est: <strong className="text-white">{projectedContracts.toFixed(4)} {ticker}</strong></span>
          </div>
        </div>

        {/* Leverage Scale */}
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Leverage Scale</span>
            </span>
            <span className="font-mono font-bold text-amber-400">{leverage}x Cross</span>
          </div>

          <div className="grid grid-cols-6 gap-1 font-mono text-xs">
            {[1, 2, 3, 5, 10, 20].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`py-1 rounded-xl font-bold border transition-all cursor-pointer ${
                  leverage === lev
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>

          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5 border-t border-white/5 font-mono">
            <span>Power: <strong>${(allocatedMarginUSD * leverage).toFixed(2)} Total</strong></span>
            <span className="text-amber-300">Cross Margin Mode</span>
          </div>
        </div>
      </div>

      {/* Row 3: Stop Loss & Take Profit Target Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Stop Loss Selector */}
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSl}
                onChange={(e) => setEnableSl(e.target.checked)}
                className="rounded accent-red-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1 text-red-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Stop Loss Trigger
              </span>
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              {enableSl && livePrice ? `~$${(livePrice * (1 - slPercent / 100)).toFixed(1)} (-${slPercent}%)` : 'Off'}
            </span>
          </div>

          {enableSl && (
            <>
              <div className="grid grid-cols-4 gap-1 font-mono text-xs pt-0.5">
                {[1, 2, 3, 5].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setSlPercent(pct)}
                    className={`py-1 rounded-xl font-bold border transition-all cursor-pointer ${
                      slPercent === pct
                        ? 'bg-red-500/25 text-red-300 border-red-500/40'
                        : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                    }`}
                  >
                    -{pct}%
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-mono text-red-400/80 flex items-center justify-between pt-0.5 border-t border-white/5">
                <span>Max Risk: -${projectedLossUSD.toFixed(2)}</span>
                <span>-{projectedLossRoi.toFixed(0)}% ROI</span>
              </div>
            </>
          )}
        </div>

        {/* Take Profit Selector */}
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTp}
                onChange={(e) => setEnableTp(e.target.checked)}
                className="rounded accent-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1 text-emerald-400">
                <Target className="w-3.5 h-3.5" />
                Take Profit Target
              </span>
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              {enableTp && livePrice ? `~$${(livePrice * (1 + tpPercent / 100)).toFixed(1)} (+${tpPercent}%)` : 'Off'}
            </span>
          </div>

          {enableTp && (
            <>
              <div className="grid grid-cols-4 gap-1 font-mono text-xs pt-0.5">
                {[2, 4, 6, 10].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setTpPercent(pct)}
                    className={`py-1 rounded-xl font-bold border transition-all cursor-pointer ${
                      tpPercent === pct
                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                        : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                    }`}
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-mono text-emerald-400/80 flex items-center justify-between pt-0.5 border-t border-white/5">
                <span>Est Profit: +${projectedProfitUSD.toFixed(2)}</span>
                <span>+{projectedProfitRoi.toFixed(0)}% ROI</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3 Dynamic Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        {/* Button 1: BUY / LONG (Guarded 2-Step Confirmation) */}
        <button
          type="button"
          onClick={() => {
            if (confirmAction !== 'BUY') {
              setConfirmAction('BUY');
              setTimeout(() => setConfirmAction(null), 4000);
            } else {
              setConfirmAction(null);
              handleExecuteOrder('BUY');
            }
          }}
          disabled={isExecuting}
          className={`p-3.5 rounded-2xl transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1 text-left ${
            confirmAction === 'BUY'
              ? 'bg-emerald-500/25 border-2 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20 animate-pulse'
              : 'bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`font-bold text-xs flex items-center gap-1 ${confirmAction === 'BUY' ? 'text-emerald-200' : 'text-emerald-300'}`}>
              <ArrowUpRight className={`w-4 h-4 ${confirmAction === 'BUY' ? 'text-emerald-300' : 'text-emerald-400'}`} />
              <span>{confirmAction === 'BUY' ? '⚠️ CONFIRM BUY (4s)' : `BUY LONG (${sizePercent}%)`}</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${confirmAction === 'BUY' ? 'bg-emerald-500/40 text-emerald-100 font-bold' : 'bg-emerald-500/20 text-emerald-200'}`}>
              {confirmAction === 'BUY' ? 'CLICK AGAIN' : `${leverage}x`}
            </span>
          </div>
          <div className={`text-[10px] ${confirmAction === 'BUY' ? 'text-emerald-200 font-semibold' : 'text-slate-400'}`}>
            {confirmAction === 'BUY' 
              ? `Click to execute $${allocatedMarginUSD.toFixed(2)} Margin ($${notionalPositionUSD.toFixed(2)} Pos)`
              : `$${allocatedMarginUSD.toFixed(2)} Margin ➔ $${notionalPositionUSD.toFixed(2)} Position`}
          </div>
        </button>

        {/* Button 2: SELL / SHORT (Guarded 2-Step Confirmation) */}
        <button
          type="button"
          onClick={() => {
            if (confirmAction !== 'SELL') {
              setConfirmAction('SELL');
              setTimeout(() => setConfirmAction(null), 4000);
            } else {
              setConfirmAction(null);
              handleExecuteOrder('SELL');
            }
          }}
          disabled={isExecuting}
          className={`p-3.5 rounded-2xl transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1 text-left ${
            confirmAction === 'SELL'
              ? 'bg-red-500/25 border-2 border-red-500 text-red-200 shadow-lg shadow-red-500/20 animate-pulse'
              : 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`font-bold text-xs flex items-center gap-1 ${confirmAction === 'SELL' ? 'text-red-200' : 'text-red-300'}`}>
              <ArrowDownRight className={`w-4 h-4 ${confirmAction === 'SELL' ? 'text-red-300' : 'text-red-400'}`} />
              <span>{confirmAction === 'SELL' ? '⚠️ CONFIRM SELL (4s)' : `SELL SHORT (${sizePercent}%)`}</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${confirmAction === 'SELL' ? 'bg-red-500/40 text-red-100 font-bold' : 'bg-red-500/20 text-red-200'}`}>
              {confirmAction === 'SELL' ? 'CLICK AGAIN' : `${leverage}x`}
            </span>
          </div>
          <div className={`text-[10px] ${confirmAction === 'SELL' ? 'text-red-200 font-semibold' : 'text-slate-400'}`}>
            {confirmAction === 'SELL'
              ? `Click to execute $${allocatedMarginUSD.toFixed(2)} Margin ($${notionalPositionUSD.toFixed(2)} Pos)`
              : `$${allocatedMarginUSD.toFixed(2)} Margin ➔ $${notionalPositionUSD.toFixed(2)} Position`}
          </div>
        </button>

        {/* Button 3: FLAT / CLOSE (Guarded 2-Step Confirmation) */}
        <button
          type="button"
          onClick={() => {
            if (confirmAction !== 'FLAT') {
              setConfirmAction('FLAT');
              setTimeout(() => setConfirmAction(null), 4000);
            } else {
              setConfirmAction(null);
              handleExecuteOrder('FLAT');
            }
          }}
          disabled={isExecuting}
          className={`p-3.5 rounded-2xl transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 disabled:opacity-50 space-y-1 text-left ${
            confirmAction === 'FLAT' 
              ? 'bg-amber-500/25 border-2 border-amber-500 text-amber-200 shadow-lg shadow-amber-500/20 animate-pulse'
              : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`font-bold text-xs flex items-center gap-1 ${confirmAction === 'FLAT' ? 'text-amber-300' : 'text-white'}`}>
              <XOctagon className={`w-4 h-4 ${confirmAction === 'FLAT' ? 'text-amber-400' : 'text-slate-300'}`} />
              <span>{confirmAction === 'FLAT' ? '⚠️ CONFIRM FLAT (4s)' : 'FLAT / CLOSE'}</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${confirmAction === 'FLAT' ? 'bg-amber-500/30 text-amber-100 font-bold' : 'bg-white/10 text-slate-300'}`}>
              {confirmAction === 'FLAT' ? 'CLICK AGAIN' : '100% Exit'}
            </span>
          </div>
          <div className={`text-[10px] ${confirmAction === 'FLAT' ? 'text-amber-200 font-semibold' : 'text-slate-400'}`}>
            {confirmAction === 'FLAT' ? 'Click once more to instantly close position' : 'Market close open position & cancel all triggers'}
          </div>
        </button>
      </div>

      {/* Execution Diagnostics Terminal */}
      <div className="p-3 rounded-2xl bg-black/50 border border-white/10 space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-white/5 pb-1.5 text-slate-400 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>Hyperliquid L1 Diagnostic Stream</span>
          </span>
          <span className="text-[10px] text-slate-500">Auto-Refreshes</span>
        </div>

        {/* Log Viewer */}
        <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pr-1 scrollbar-thin">
          {executionLogs.length === 0 ? (
            <div className="text-slate-600 italic text-[10px]">No execution logs yet. Click an action above to execute.</div>
          ) : (
            executionLogs.map((log, i) => (
              <div 
                key={i} 
                className={`leading-tight flex items-start gap-1.5 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-emerald-400' :
                  'text-slate-300'
                }`}
              >
                <span className="text-slate-600 text-[9px] select-none">[{log.timestamp}]</span>
                <span className="break-all">{log.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </GlassCard>
  );
};

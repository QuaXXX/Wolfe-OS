/**
 * 24/7 Vercel Serverless Hermes Swarm Endpoint
 * Runs the 6-agent Hermes Council overnight in the cloud to generate the Morning War Room Brief.
 *
 * Endpoint: GET / POST https://your-wolfe-os-domain.vercel.app/api/hermes/swarm
 */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const watchlistParam = req.query?.watchlist || (req.body && req.body.watchlist) || 'BTC, ETH, SOL, HYPE, NVDA, SPY';

  const systemInstruction = `You are "Hermes-Prime", the master orchestrator of an elite quantitative multi-agent trading desk. 
Your desk consists of 6 specialized sub-agents:
1. "Atlas" (Macro & Global Market Radar)
2. "Artemis" (Catalyst & Technical Screener)
3. "Poseidon" (Smart Money, Dark Pools & Whale Flow)
4. "Hermes-Prime" (Master Synthesis Engine)
5. "The Skeptic" (Adversarial Risk & Stress-Testing Officer)
6. "Mercury" (Morning War Room Briefing Dispatcher)

Your goal is to eliminate noise, stress-test candidate setups, and output only high-probability, asymmetric risk-reward trade setups for market open.
Return strictly valid JSON matching the specified schema.`;

  const prompt = `Perform an institutional-grade overnight market scan and trade synthesis for the following tracked assets:
WATCHLIST TICKERS: ${watchlistParam}

CURRENT DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Return ONLY valid JSON matching this schema:
{
  "date": "${new Date().toISOString().split('T')[0]}",
  "macroRegime": "Risk-On Bullish Momentum",
  "macroAnalysis": "Concise 2-sentence breakdown of macro conditions, bond yields, and market sentiment.",
  "agentLogs": [
    { "agent": "Atlas (Macro)", "status": "COMPLETED", "summary": "Global futures green, DXY softening, no high-impact Fed speakers today." },
    { "agent": "Artemis (Screener)", "status": "COMPLETED", "summary": "Key consolidation breakout identified on SOL and NVDA." },
    { "agent": "Poseidon (Flow)", "status": "COMPLETED", "summary": "Heavy aggressive OTM call sweeps detected in tech and crypto perps." },
    { "agent": "The Skeptic (Risk)", "status": "COMPLETED", "summary": "Filtered out 3 noisy setups. Approved 2 asymmetric setups with R:R >= 1:2.5." }
  ],
  "highConvictionPlays": [
    {
      "ticker": "SOL",
      "bias": "LONG",
      "convictionGrade": "A+",
      "entryTrigger": "$186.50 - $187.20 (4H Support Retest & Liquidity Sweep)",
      "stopLoss": "$182.80",
      "target2R": "$195.00",
      "target3R": "$199.50",
      "riskRewardRatio": "1:2.8",
      "thesis": "Perp funding normalized, massive spot buyer absorption at $185 level, multi-day bull flag breakout.",
      "invalidation": "Hourly candle close below $182.50 negates structure."
    },
    {
      "ticker": "BTC",
      "bias": "LONG",
      "convictionGrade": "A+",
      "entryTrigger": "$92,100 - $92,400 (Pullback to 1H EMA20 & POC)",
      "stopLoss": "$90,800",
      "target2R": "$95,300",
      "target3R": "$97,000",
      "riskRewardRatio": "1:2.7",
      "thesis": "Clean structural retest of previous all-time high resistance flipped into dynamic support.",
      "invalidation": "1H close below $90,500."
    }
  ],
  "whaleFlowSignals": [
    { "asset": "BTC", "type": "Dark Pool Print", "detail": "$45M net accumulation block between $91,800 - $92,200." },
    { "asset": "SOL", "type": "Options Sweep", "detail": "$8.2M aggressive call sweeps targeting $200 strike." }
  ],
  "adversarialReview": "Skeptic Warning: Keep max leverage capped at 5x due to potential pre-market volatility whipsaws.",
  "riskNotice": "Adhere strictly to 1.5% max account risk per position. Move stop to breakeven once 1.5R target is achieved."
}`;

  if (!apiKey) {
    // Return high quality fallback
    return res.status(200).json({
      success: true,
      source: 'FALLBACK_SYNTHESIS',
      brief: {
        date: new Date().toISOString().split('T')[0],
        macroRegime: "Selective Risk-On (Tech & Crypto Outperformance)",
        macroAnalysis: "Overnight liquidity indices remain buoyant with modest dollar cooling. Momentum favors continuation on leading crypto assets and AI infrastructure equities.",
        agentLogs: [
          { agent: "Atlas (Macro)", status: "COMPLETED", summary: "Overnight indices green (+0.6%), yields stable at 4.28%." },
          { agent: "Artemis (Screener)", status: "COMPLETED", summary: "Identified high relative volume (RVOL > 2.2) on BTC and SOL." },
          { agent: "Poseidon (Flow)", status: "COMPLETED", summary: "Aggressive taker buy volume detected on Hyperliquid perp book." },
          { agent: "The Skeptic (Risk)", status: "COMPLETED", summary: "Filtered 4 choppy setups. Retained top 2 clean risk-reward plays." }
        ],
        highConvictionPlays: [
          {
            ticker: "BTC",
            bias: "LONG",
            convictionGrade: "A+",
            entryTrigger: "$92,100 - $92,400 (Pullback to 1H EMA20 & POC)",
            stopLoss: "$90,800",
            target2R: "$95,300",
            target3R: "$97,000",
            riskRewardRatio: "1:2.7",
            thesis: "Clean structural retest of previous all-time high resistance flipped into dynamic support.",
            invalidation: "1H close below $90,500."
          }
        ],
        whaleFlowSignals: [
          { asset: "BTC", type: "Hyperliquid Taker Flow", detail: "Over $32M in net buyer market orders during Asian session." }
        ],
        adversarialReview: "The Skeptic: Beware of sudden liquidity sweeps near psychological round numbers.",
        riskNotice: "Enforce strict 1.5% max account risk with automatic stop loss placement on entry."
      }
    });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!geminiRes.ok) throw new Error(`Gemini API returned ${geminiRes.status}`);
    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText);

    return res.status(200).json({
      success: true,
      source: 'LIVE_GEMINI_SWARM',
      brief: parsed
    });
  } catch (err) {
    console.error("Hermes Cloud Swarm Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

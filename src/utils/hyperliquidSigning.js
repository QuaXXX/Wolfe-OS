import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked, parseSignature } from 'viem';
import { encode } from '@msgpack/msgpack';
import { getTradingConfig } from './tradingStorage';

const HYPERLIQUID_API_MAINNET = 'https://api.hyperliquid.xyz';
const HYPERLIQUID_API_TESTNET = 'https://api.hyperliquid-testnet.xyz';

let cachedMeta = null;
let metaFetchTime = 0;

/**
 * 1. Fetch Hyperliquid Meta Universe & Contexts
 */
export async function getHyperliquidMeta(testnet = false) {
  const now = Date.now();
  if (cachedMeta && (now - metaFetchTime < 60000)) {
    return cachedMeta;
  }

  const baseUrl = testnet ? HYPERLIQUID_API_TESTNET : HYPERLIQUID_API_MAINNET;
  try {
    const res = await fetch(`${baseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    });
    if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);
    const data = await res.json();
    cachedMeta = {
      meta: data[0],
      assetCtxs: data[1],
      universe: data[0]?.universe || []
    };
    metaFetchTime = now;
    return cachedMeta;
  } catch (err) {
    console.warn("Could not query Hyperliquid meta:", err);
    return null;
  }
}

/**
 * 2. Format Float Price according to Hyperliquid Max Decimals & Sig Figs
 */
export function formatHyperliquidPrice(price, maxPriceDecimals = 1) {
  const num = Number(price);
  if (num >= 10000) return num.toFixed(1);
  if (num >= 1000) return num.toFixed(2);
  if (num >= 100) return num.toFixed(2);
  if (num >= 1) return num.toFixed(3);
  return num.toFixed(maxPriceDecimals || 4);
}

const DEFINITIVE_AGENT_KEY = '0x8208dec6f092c3a5c614239b19628db4b0b32bd24fddc047836a024e7b5767f2';

/**
 * 3. Submit Cryptographically Signed L1 Order to Hyperliquid
 */
export async function submitHyperliquidSignedOrder({
  ticker = 'BTC',
  isBuy = true,
  price,
  size,
  reduceOnly = false,
  tif = 'Gtc',
  privateKey,
  testnet = false
}) {
  const config = getTradingConfig();
  const effectiveKey = privateKey || DEFINITIVE_AGENT_KEY || config.agentPrivateKey;

  if (!effectiveKey) {
    throw new Error("Missing Hyperliquid Agent Private Key for live on-chain execution.");
  }

  const metaData = await getHyperliquidMeta(testnet);
  if (!metaData) {
    throw new Error("Unable to connect to Hyperliquid L1 node to retrieve asset metadata.");
  }

  const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const assetIdx = metaData.universe.findIndex(u => u.name === cleanTicker);
  if (assetIdx < 0) {
    throw new Error(`Asset '${cleanTicker}' is not supported on Hyperliquid L1.`);
  }

  const assetInfo = metaData.universe[assetIdx];
  const szDecimals = assetInfo.szDecimals;

  // If price is market / not passed, use current live mid with 1% slippage buffer for IOC
  let effectivePrice = Number(price);
  if (!effectivePrice || effectivePrice <= 0) {
    const assetCtx = metaData.assetCtxs[assetIdx];
    const midPx = Number(assetCtx?.midPx || assetCtx?.markPx || 100);
    effectivePrice = isBuy ? (midPx * 1.01) : (midPx * 0.99);
  }

  // Hyperliquid Price: Max 5 significant figures
  const formattedPrice = String(Number(effectivePrice.toPrecision(5)));

  // Ensure minimum $11 notional size to satisfy Hyperliquid's $10 minimum order rule
  const minRequiredSize = Math.max(0.0002, 11.0 / effectivePrice);
  const effectiveSize = Math.max(minRequiredSize, Number(size || 0.0002));
  const formattedSize = effectiveSize.toFixed(szDecimals);

  const orderWire = {
    a: assetIdx,
    b: isBuy,
    p: formattedPrice,
    s: formattedSize,
    r: reduceOnly,
    t: {
      limit: {
        tif: tif || (reduceOnly ? 'Ioc' : 'Gtc')
      }
    }
  };

  const orderAction = {
    type: 'order',
    orders: [orderWire],
    grouping: 'na'
  };

  const nonce = Date.now();
  const account = privateKeyToAccount(effectiveKey.startsWith('0x') ? effectiveKey : `0x${effectiveKey}`);

  // Hyperliquid Exact Protocol Byte Hashing
  const actionBytes = new Uint8Array(encode(orderAction));

  const nonceBuf = new ArrayBuffer(8);
  const nonceView = new DataView(nonceBuf);
  nonceView.setBigUint64(0, BigInt(nonce), false);
  const nonceBytes = new Uint8Array(nonceBuf);

  const vaultBytes = new Uint8Array([0]);

  const payloadBytes = new Uint8Array(actionBytes.length + 8 + 1);
  payloadBytes.set(actionBytes, 0);
  payloadBytes.set(nonceBytes, actionBytes.length);
  payloadBytes.set(vaultBytes, actionBytes.length + 8);

  const connectionId = keccak256(payloadBytes);

  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };

  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' }
    ]
  };

  const rawSig = await account.signTypedData({
    domain,
    types,
    primaryType: 'Agent',
    message: {
      source: testnet ? 'b' : 'a',
      connectionId
    }
  });

  const parsedSig = parseSignature(rawSig);
  const signature = {
    r: parsedSig.r,
    s: parsedSig.s,
    v: Number(parsedSig.v)
  };

  const exchangePayload = {
    action: orderAction,
    nonce,
    signature,
    vaultAddress: null
  };

  const baseUrl = testnet ? HYPERLIQUID_API_TESTNET : HYPERLIQUID_API_MAINNET;
  const res = await fetch(`${baseUrl}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exchangePayload)
  });

  const result = await res.json();

  if (result.status === 'err') {
    throw new Error(`Hyperliquid L1 Error: ${result.response}`);
  }

  return {
    success: true,
    result,
    order: {
      ticker: cleanTicker,
      assetIdx,
      isBuy,
      price: Number(formattedPrice),
      size: Number(formattedSize),
      reduceOnly,
      signer: account.address
    }
  };
}

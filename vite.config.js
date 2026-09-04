import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import marketPricesHandler from './api/market-prices.js'
import historicalCandlesHandler from './api/historical-candles.js'
import webhookHandler from './api/webhook/tradingview.js'

function apiHandlerMiddleware(handler) {
  return async (req, res) => {
    try {
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return res;
      };

      if (req.method === 'POST' && !req.body) {
        let rawBody = '';
        for await (const chunk of req) {
          rawBody += chunk;
        }
        try {
          req.body = JSON.parse(rawBody);
        } catch {
          req.body = rawBody;
        }
      }

      await handler(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-serverless-middleware',
      configureServer(server) {
        server.middlewares.use('/api/market-prices', apiHandlerMiddleware(marketPricesHandler));
        server.middlewares.use('/api/historical-candles', apiHandlerMiddleware(historicalCandlesHandler));
        server.middlewares.use('/api/webhook/tradingview', apiHandlerMiddleware(webhookHandler));
      }
    }
  ],
})

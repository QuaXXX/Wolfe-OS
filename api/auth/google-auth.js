/**
 * Vercel Serverless Function & Vite Middleware: Google OAuth Token Exchange & Background Refresh
 * Handles permanent device authentication by exchanging authorization codes for refresh tokens
 * and providing direct server-to-server token refresh (0 popups, 0 cookies needed).
 */

const DEFAULT_CLIENT_ID = '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse action and parameters
  const urlObj = new URL(req.url, 'http://localhost');
  let action = urlObj.searchParams.get('action');

  let body = {};
  if (req.body) {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  if (!action && body.action) {
    action = body.action;
  }

  try {
    // -------------------------------------------------------------------------
    // 1. ACTION: EXCHANGE (Authorization Code -> Permanent Refresh Token + Access Token)
    // -------------------------------------------------------------------------
    if (action === 'exchange') {
      const code = body.code || urlObj.searchParams.get('code');
      if (!code) {
        return res.status(400).json({ error: 'Missing authorization code.' });
      }

      const clientId = body.client_id || 
                       process.env.GOOGLE_CLIENT_ID || 
                       process.env.VITE_GOOGLE_CLIENT_ID || 
                       DEFAULT_CLIENT_ID;
      const clientSecret = body.client_secret || 
                           process.env.GOOGLE_CLIENT_SECRET || 
                           process.env.VITE_GOOGLE_CLIENT_SECRET || 
                           '';
      const redirectUri = body.redirect_uri || 'postmessage';
      const codeVerifier = body.code_verifier || '';

      const tokenParams = new URLSearchParams({
        code: code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      if (clientSecret) {
        tokenParams.append('client_secret', clientSecret);
      }
      if (codeVerifier) {
        tokenParams.append('code_verifier', codeVerifier);
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return res.status(tokenRes.status || 400).json({
          error: tokenData.error_description || tokenData.error || 'Token exchange failed',
          details: tokenData
        });
      }

      // Fetch user profile info with the new access token
      let userInfo = null;
      if (tokenData.access_token) {
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          if (userRes.ok) {
            const uData = await userRes.json();
            userInfo = {
              email: uData.email,
              name: uData.name,
              picture: uData.picture,
              id: uData.id
            };
          }
        } catch (e) {
          // Non-blocking
        }
      }

      return res.status(200).json({
        success: true,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_in: tokenData.expires_in || 3600,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        user: userInfo
      });
    }

    // -------------------------------------------------------------------------
    // 2. ACTION: REFRESH (Permanent Refresh Token -> Fresh Access Token)
    // -------------------------------------------------------------------------
    if (action === 'refresh') {
      const refreshToken = body.refresh_token || urlObj.searchParams.get('refresh_token');
      if (!refreshToken) {
        return res.status(400).json({ error: 'Missing refresh token.' });
      }

      const clientId = body.client_id || 
                       process.env.GOOGLE_CLIENT_ID || 
                       process.env.VITE_GOOGLE_CLIENT_ID || 
                       DEFAULT_CLIENT_ID;
      const clientSecret = body.client_secret || 
                           process.env.GOOGLE_CLIENT_SECRET || 
                           process.env.VITE_GOOGLE_CLIENT_SECRET || 
                           '';

      const tokenParams = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        grant_type: 'refresh_token'
      });

      if (clientSecret) {
        tokenParams.append('client_secret', clientSecret);
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return res.status(tokenRes.status || 400).json({
          error: tokenData.error_description || tokenData.error || 'Token refresh failed',
          details: tokenData
        });
      }

      return res.status(200).json({
        success: true,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in || 3600,
        token_type: tokenData.token_type || 'Bearer'
      });
    }

    // -------------------------------------------------------------------------
    // 3. ACTION: USERINFO (Verify Token & Get Account Details)
    // -------------------------------------------------------------------------
    if (action === 'userinfo') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '') || body.access_token;
      if (!token) {
        return res.status(401).json({ error: 'No access token provided.' });
      }

      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!userRes.ok) {
        return res.status(userRes.status).json({ error: 'Invalid or expired access token.' });
      }

      const uData = await userRes.json();
      return res.status(200).json({
        success: true,
        user: {
          email: uData.email,
          name: uData.name,
          picture: uData.picture,
          id: uData.id
        }
      });
    }

    // Default status response
    return res.status(200).json({
      service: 'Wolfe OS Google OAuth Service',
      status: 'operational',
      actions: ['exchange', 'refresh', 'userinfo']
    });

  } catch (err) {
    console.error('Google Auth serverless error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

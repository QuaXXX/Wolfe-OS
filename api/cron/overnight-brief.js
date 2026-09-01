/**
 * Vercel Serverless Cron Job
 * Wakes up automatically every morning at 5:00 AM MST / 12:00 UTC,
 * executes the Hermes 6-agent swarm, and pre-generates the Morning War Room Briefing.
 */

export default async function handler(req, res) {
  // Check authorization header for Vercel Cron Secret (if configured)
  const authHeader = req.headers?.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized Cron Request' });
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const swarmUrl = `${protocol}://${host}/api/hermes/swarm`;

    const swarmRes = await fetch(swarmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'VERCEL_CRON_OVERNIGHT' })
    });

    const data = await swarmRes.json();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Overnight Hermes Swarm executed and Morning Briefing ready.',
      result: data
    });
  } catch (err) {
    console.error("Cron Overnight Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

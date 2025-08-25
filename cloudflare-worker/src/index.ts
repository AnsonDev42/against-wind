/**
 * Cloudflare Worker for Strava Integration
 * Handles webhooks, OAuth, and GPX processing for wind analysis
 */

interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  STRAVA_WEBHOOK_VERIFY_TOKEN: string;
  API_BASE_URL: string;
  KV_STORE: any; // KV namespace binding
}

interface StravaWebhookEvent {
  aspect_type: 'create' | 'update' | 'delete';
  event_time: number;
  object_id: number;
  object_type: 'activity' | 'athlete';
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, any>;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  description?: string;
  has_heartrate: boolean;
  average_speed: number;
  max_speed: number;
}

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete_id: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (path) {
        case '/webhook':
          return handleWebhook(request, env);
        case '/auth/strava':
          return handleStravaAuth(request, env);
        case '/auth/callback':
          return handleAuthCallback(request, env);
        case '/auth/disconnect':
          return handleDisconnect(request, env);
        case '/health':
          return new Response(JSON.stringify({ status: 'ok' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    // Webhook verification
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (request.method === 'POST') {
    const event: StravaWebhookEvent = await request.json();
    
    // Only process new cycling activities
    if (event.object_type === 'activity' && event.aspect_type === 'create') {
      await processNewActivity(event, env);
    }

    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processNewActivity(event: StravaWebhookEvent, env: Env): Promise<void> {
  try {
    // Get user tokens
    const tokens = await getUserTokens(event.owner_id, env);
    if (!tokens) {
      console.log(`No tokens found for athlete ${event.owner_id}`);
      return;
    }

    // Refresh token if needed
    const validTokens = await ensureValidTokens(tokens, env);
    if (!validTokens) {
      console.log(`Failed to refresh tokens for athlete ${event.owner_id}`);
      return;
    }

    // Get activity details
    const activity = await getActivityDetails(event.object_id, validTokens.access_token);
    if (!activity || !isCyclingActivity(activity)) {
      console.log(`Activity ${event.object_id} is not a cycling activity`);
      return;
    }

    // Download GPX file
    const gpxData = await downloadActivityGPX(event.object_id, validTokens.access_token);
    if (!gpxData) {
      console.log(`No GPX data available for activity ${event.object_id}`);
      return;
    }

    // Analyze wind conditions
    const windAnalysis = await analyzeWindConditions(gpxData, env);
    if (!windAnalysis) {
      console.log(`Wind analysis failed for activity ${event.object_id}`);
      return;
    }

    // Update activity description
    await updateActivityDescription(event.object_id, activity, windAnalysis, validTokens.access_token);
    
    console.log(`Successfully processed activity ${event.object_id} for athlete ${event.owner_id}`);
  } catch (error) {
    console.error(`Error processing activity ${event.object_id}:`, error);
  }
}

async function getUserTokens(athleteId: number, env: Env): Promise<StravaTokens | null> {
  const key = `strava_tokens:${athleteId}`;
  const tokensJson = await env.KV_STORE.get(key);
  return tokensJson ? JSON.parse(tokensJson) : null;
}

async function ensureValidTokens(tokens: StravaTokens, env: Env): Promise<StravaTokens | null> {
  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 300) {
    return tokens;
  }

  // Refresh the token
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    console.error('Failed to refresh Strava token:', await response.text());
    return null;
  }

  const newTokens = await response.json();
  const updatedTokens: StravaTokens = {
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: newTokens.expires_at,
    athlete_id: tokens.athlete_id
  };

  // Store updated tokens
  const key = `strava_tokens:${tokens.athlete_id}`;
  await env.KV_STORE.put(key, JSON.stringify(updatedTokens));

  return updatedTokens;
}

async function getActivityDetails(activityId: number, accessToken: string): Promise<StravaActivity | null> {
  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    console.error('Failed to get activity details:', await response.text());
    return null;
  }

  return await response.json();
}

function isCyclingActivity(activity: StravaActivity): boolean {
  const cyclingTypes = ['Ride', 'VirtualRide', 'EBikeRide', 'Gravel', 'MountainBikeRide'];
  return cyclingTypes.includes(activity.type) || cyclingTypes.includes(activity.sport_type);
}

async function downloadActivityGPX(activityId: number, accessToken: string): Promise<string | null> {
  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,time,altitude&key_by_type=true`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    console.error('Failed to download activity streams:', await response.text());
    return null;
  }

  const streams = await response.json();
  
  // Convert streams to GPX format
  return convertStreamsToGPX(streams, activityId);
}

function convertStreamsToGPX(streams: any, activityId: number): string {
  const latlng = streams.latlng?.data || [];
  const time = streams.time?.data || [];
  const altitude = streams.altitude?.data || [];

  if (latlng.length === 0) {
    return '';
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Against Wind Strava Integration">
  <trk>
    <name>Strava Activity ${activityId}</name>
    <trkseg>`;

  for (let i = 0; i < latlng.length; i++) {
    const [lat, lng] = latlng[i];
    const ele = altitude[i] || 0;
    const timeOffset = time[i] || 0;
    
    // Create ISO timestamp (assuming start time, we'll need to get this from activity details)
    const timestamp = new Date(Date.now() + timeOffset * 1000).toISOString();
    
    gpx += `
      <trkpt lat="${lat}" lon="${lng}">
        <ele>${ele}</ele>
        <time>${timestamp}</time>
      </trkpt>`;
  }

  gpx += `
    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

async function analyzeWindConditions(gpxData: string, env: Env): Promise<any | null> {
  try {
    const response = await fetch(`${env.API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gpx_content: gpxData,
        use_gpx_timestamps: true,
        timing_mode: 'gpx_timestamps'
      })
    });

    if (!response.ok) {
      console.error('Wind analysis failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error calling wind analysis API:', error);
    return null;
  }
}

async function updateActivityDescription(
  activityId: number, 
  activity: StravaActivity, 
  windAnalysis: any, 
  accessToken: string
): Promise<void> {
  const windSummary = generateWindSummary(windAnalysis);
  const currentDescription = activity.description || '';
  const newDescription = currentDescription + '\n\n🌬️ Wind Analysis:\n' + windSummary;

  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: newDescription
    })
  });

  if (!response.ok) {
    console.error('Failed to update activity description:', await response.text());
  }
}

function generateWindSummary(windAnalysis: any): string {
  if (!windAnalysis || !windAnalysis.summary) {
    return 'Wind analysis data not available.';
  }

  const summary = windAnalysis.summary;
  return `Average wind: ${summary.avg_wind_speed?.toFixed(1) || 'N/A'} km/h
Headwind time: ${summary.headwind_percentage?.toFixed(1) || 'N/A'}%
Tailwind time: ${summary.tailwind_percentage?.toFixed(1) || 'N/A'}%
Max wind speed: ${summary.max_wind_speed?.toFixed(1) || 'N/A'} km/h
Powered by Against Wind 🚴‍♂️`;
}

async function handleStravaAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return new Response('Missing user_id parameter', { status: 400 });
  }

  const authUrl = `https://www.strava.com/oauth/authorize?` +
    `client_id=${env.STRAVA_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(url.origin + '/auth/callback')}&` +
    `approval_prompt=force&` +
    `scope=read,activity:read,activity:write&` +
    `state=${userId}`;

  return Response.redirect(authUrl, 302);
}

async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // This is our user_id
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`Authorization failed: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response('Missing code or state parameter', { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();
    
    // Store tokens in KV
    const stravaTokens: StravaTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      athlete_id: tokens.athlete.id
    };

    const key = `strava_tokens:${tokens.athlete.id}`;
    await env.KV_STORE.put(key, JSON.stringify(stravaTokens));

    // Also store mapping from our user_id to strava athlete_id
    await env.KV_STORE.put(`user_mapping:${state}`, tokens.athlete.id.toString());

    return new Response(`
      <html>
        <body>
          <h1>Strava Integration Successful!</h1>
          <p>Your Strava account has been connected. You can now close this window.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return new Response('Authentication failed', { status: 500 });
  }
}

async function handleDisconnect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  
  if (!userId) {
    return new Response('Missing user_id parameter', { status: 400 });
  }

  try {
    // Get athlete ID from mapping
    const athleteId = await env.KV_STORE.get(`user_mapping:${userId}`);
    
    if (athleteId) {
      // Remove tokens and mapping
      await env.KV_STORE.delete(`strava_tokens:${athleteId}`);
      await env.KV_STORE.delete(`user_mapping:${userId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    return new Response('Disconnect failed', { status: 500 });
  }
}

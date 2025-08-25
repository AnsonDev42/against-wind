# Strava Integration Setup Guide

This guide explains how to set up the Strava integration for automatic wind analysis of cycling activities.

## Architecture Overview

The Strava integration consists of three main components:

1. **Cloudflare Worker** - Handles Strava webhooks, OAuth, and GPX processing
2. **Backend API** - Provides Strava integration endpoints
3. **Frontend UI** - Settings panel for users to connect their Strava accounts

## Setup Instructions

### 1. Strava App Configuration

1. Go to [Strava Developers](https://www.strava.com/settings/api)
2. Create a new application with these settings:
   - **Application Name**: Against Wind
   - **Category**: Data Importer
   - **Authorization Callback Domain**: Your Cloudflare Worker domain
   - **Website**: Your application URL

3. Note down your:
   - Client ID
   - Client Secret

### 2. Cloudflare Worker Deployment

1. Install dependencies:
   ```bash
   cd cloudflare-worker
   npm install
   ```

2. Create a KV namespace:
   ```bash
   wrangler kv:namespace create "KV_STORE"
   wrangler kv:namespace create "KV_STORE" --preview
   ```

3. Update `wrangler.toml` with your KV namespace IDs

4. Set environment variables:
   ```bash
   wrangler secret put STRAVA_CLIENT_ID
   wrangler secret put STRAVA_CLIENT_SECRET
   wrangler secret put STRAVA_WEBHOOK_VERIFY_TOKEN
   ```

5. Deploy the worker:
   ```bash
   wrangler deploy
   ```

### 3. Backend Configuration

Add these environment variables to your API:

```env
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
STRAVA_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

### 4. Webhook Setup

1. Use the API endpoint to create the webhook subscription:
   ```bash
   curl -X POST http://localhost:8000/api/v1/strava/webhook/setup
   ```

2. Verify the webhook is active:
   ```bash
   curl http://localhost:8000/api/v1/strava/webhook/status
   ```

### 5. Frontend Dependencies

Install required UI dependencies:

```bash
cd ui
pnpm add @radix-ui/react-switch @radix-ui/react-label @radix-ui/react-separator @radix-ui/react-tabs @radix-ui/react-slot
pnpm add class-variance-authority lucide-react
```

## How It Works

1. **User Authentication**: Users connect their Strava account via OAuth
2. **Webhook Registration**: System registers for activity creation events
3. **Activity Processing**: When a new cycling activity is uploaded:
   - Webhook triggers the Cloudflare Worker
   - Worker downloads GPX data from Strava
   - Worker calls the wind analysis API
   - Worker updates the activity description with wind summary

## Features

- **Automatic Analysis**: New cycling activities are automatically analyzed
- **Smart Filtering**: Only processes cycling activities (rides, virtual rides, etc.)
- **Wind Summary**: Adds detailed wind analysis to activity descriptions
- **User Settings**: Configurable auto-analysis and description updates

## Example Wind Summary

```
🌬️ Wind Analysis:
Average wind: 12.3 km/h
Headwind time: 35.2%
Tailwind time: 28.1%
Max wind speed: 18.7 km/h
Powered by Against Wind 🚴‍♂️
```

## Rate Limits

- Strava API: 200 requests per 15 minutes, 2,000 per day
- The system respects these limits and processes activities asynchronously

## Security

- All tokens are stored securely in Cloudflare KV
- Tokens are automatically refreshed when needed
- Users can disconnect their accounts at any time

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook subscription status
2. Verify callback URL is accessible
3. Ensure verify token matches

### Authentication Issues
1. Check client ID and secret
2. Verify callback domain matches Strava app settings
3. Ensure tokens are not expired

### Analysis Failures
1. Check API connectivity from Cloudflare Worker
2. Verify GPX data is available for the activity
3. Check wind analysis API logs

## Development

To test the integration locally:

1. Use ngrok to expose your local API:
   ```bash
   ngrok http 8000
   ```

2. Update the worker's `API_BASE_URL` to your ngrok URL

3. Deploy the worker with the test configuration

## Production Deployment

1. Set up proper domain for the Cloudflare Worker
2. Configure production API URL
3. Set up monitoring for webhook failures
4. Implement proper error handling and retry logic

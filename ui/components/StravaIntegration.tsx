'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle, ExternalLink, Settings, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StravaConnectionStatus {
  connected: boolean;
  athlete_id?: number;
  athlete_name?: string;
}

interface StravaSettings {
  auto_analyze: boolean;
  update_description: boolean;
  cycling_only: boolean;
}

export default function StravaIntegration() {
  const [connectionStatus, setConnectionStatus] = useState<StravaConnectionStatus>({ connected: false });
  const [settings, setSettings] = useState<StravaSettings>({
    auto_analyze: true,
    update_description: true,
    cycling_only: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate a simple user ID for demo purposes
  const userId = 'demo-user-123';

  useEffect(() => {
    fetchConnectionStatus();
    fetchSettings();
  }, []);

  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch(`/api/v1/strava/status?user_id=${userId}`);
      if (response.ok) {
        const status = await response.json();
        setConnectionStatus(status);
      }
    } catch (err) {
      console.error('Failed to fetch Strava status:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/v1/strava/settings?user_id=${userId}`);
      if (response.ok) {
        const userSettings = await response.json();
        setSettings(userSettings);
      }
    } catch (err) {
      console.error('Failed to fetch Strava settings:', err);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/strava/auth-url?user_id=${userId}`);
      if (response.ok) {
        const { auth_url } = await response.json();
        // Open Strava auth in a new window
        const authWindow = window.open(auth_url, 'strava-auth', 'width=600,height=700');
        
        // Poll for window closure (indicates auth completion)
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            // Refresh status after a short delay
            setTimeout(() => {
              fetchConnectionStatus();
              setLoading(false);
            }, 1000);
          }
        }, 1000);
      } else {
        throw new Error('Failed to get auth URL');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Strava');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/v1/strava/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      
      if (response.ok) {
        setConnectionStatus({ connected: false });
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect from Strava');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (key: keyof StravaSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      const response = await fetch(`/api/v1/strava/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...newSettings })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      // Revert the setting
      setSettings(settings);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <CardTitle>Strava Integration</CardTitle>
              <CardDescription>
                Automatically analyze wind conditions for your cycling activities
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connectionStatus.connected ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium">
                  {connectionStatus.connected ? 'Connected to Strava' : 'Not connected'}
                </p>
                {connectionStatus.athlete_name && (
                  <p className="text-sm text-muted-foreground">
                    {connectionStatus.athlete_name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connectionStatus.connected && (
                <Badge variant="secondary">
                  ID: {connectionStatus.athlete_id}
                </Badge>
              )}
              {connectionStatus.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  disabled={loading}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect to Strava
                </Button>
              )}
            </div>
          </div>

          {connectionStatus.connected && (
            <>
              <Separator />
              
              {/* Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <h3 className="font-medium">Integration Settings</h3>
                </div>
                
                <div className="space-y-4 pl-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-analyze">Auto-analyze new activities</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically analyze wind conditions for new cycling activities
                      </p>
                    </div>
                    <Switch
                      id="auto-analyze"
                      checked={settings.auto_analyze}
                      onCheckedChange={(checked) => handleSettingChange('auto_analyze', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="update-description">Update activity descriptions</Label>
                      <p className="text-sm text-muted-foreground">
                        Add wind analysis summary to your Strava activity descriptions
                      </p>
                    </div>
                    <Switch
                      id="update-description"
                      checked={settings.update_description}
                      onCheckedChange={(checked) => handleSettingChange('update_description', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="cycling-only">Cycling activities only</Label>
                      <p className="text-sm text-muted-foreground">
                        Only process cycling activities (rides, virtual rides, etc.)
                      </p>
                    </div>
                    <Switch
                      id="cycling-only"
                      checked={settings.cycling_only}
                      onCheckedChange={(checked) => handleSettingChange('cycling_only', checked)}
                    />
                  </div>
                </div>
              </div>

              <Separator />
              
              {/* How it works */}
              <div className="space-y-3">
                <h3 className="font-medium">How it works</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>1. Upload a new cycling activity to Strava</p>
                  <p>2. Our system automatically downloads the GPX data</p>
                  <p>3. Wind conditions are analyzed using historical weather data</p>
                  <p>4. A summary is added to your activity description</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

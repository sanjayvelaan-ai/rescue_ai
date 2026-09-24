import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BrowserCameraProvider } from './lib/browser-camera';
import { DeviceLocationProvider } from './lib/device-location';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { StarsBackground } from '@/components/ui/stars';
import { DashboardPage } from './pages/DashboardPage';
import { LiveMissionPage } from './pages/LiveMissionPage';
import { AIDetectionPage } from './pages/AIDetectionPage';
import { DisasterMapPage } from './pages/DisasterMapPage';
import { DroneFleetPage } from './pages/DroneFleetPage';
import { MissionsPage } from './pages/MissionsPage';
import { AlertCenterPage } from './pages/AlertCenterPage';
import { RescueOpsPage } from './pages/RescueOpsPage';
import { EmergencyPayloadPage } from './pages/EmergencyPayloadPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

import type { Survivor, Alert, RescueTeam, Mission, DroneFleet, Hazard, SystemStatus } from './types';
import { api } from './services/api';
import { useWebSocket } from './hooks/useWebSocket';

export function App() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [drone, setDrone] = useState<DroneFleet | undefined>(undefined);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | undefined>(undefined);

  const inFlight = useRef(false);
  const [dataError, setDataError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [droneUpdatedAt, setDroneUpdatedAt] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const fetchAllData = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const results = await Promise.allSettled([
        api.getSurvivors(), api.getAlerts(), api.getRescueTeams(), api.getMissions(),
        api.getDrone(), api.getMapState(), api.getSystemStatus(),
      ] as const);
      const [s,a,t,m,d,map,sys] = results;
      if (s.status === 'fulfilled') setSurvivors(s.value);
      if (a.status === 'fulfilled') setAlerts(a.value);
      if (t.status === 'fulfilled') setTeams(t.value);
      if (m.status === 'fulfilled') setMissions(m.value);
      if (d.status === 'fulfilled') {setDrone(d.value);setDroneUpdatedAt(new Date().toISOString());}
      if (map.status === 'fulfilled') setHazards(map.value.hazards);
      setSystemStatus(sys.status === 'fulfilled' ? sys.value : undefined);
      if (s.status === 'fulfilled' && t.status === 'fulfilled') {
        setLastUpdated(new Date().toISOString());setDataError('');
      } else setDataError('Could not refresh detection or team records. Showing the last successful data, if any.');
    } finally {inFlight.current=false;setDataLoading(false);}
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Listen for WebSocket live events including rescue team movement
  useWebSocket((event) => {
    if (event.type === 'team_movement') {
      setTeams((prev) =>
        prev.map((t) =>
          t.team_id === event.team_id
            ? {
                ...t,
                latitude: event.latitude,
                longitude: event.longitude,
                status: event.status || 'EN_ROUTE',
                eta_seconds: event.eta_seconds !== undefined ? event.eta_seconds : t.eta_seconds,
              }
            : t
        )
      );
    } else if (
      event.type === 'survivor_detected' ||
      event.type === 'history_cleared' ||
      event.type === 'alert_created' ||
      event.type === 'radar_alert' ||
      event.type === 'radar_update' ||
      event.type === 'survivor_rescued' ||
      event.type === 'team_status_updated' ||
      event.type === 'simulation_event'
    ) {
      fetchAllData();
    }
  });

  const unreadAlertsCount = alerts.filter((a) => a.status === 'UNREAD').length;

  return (
    <DeviceLocationProvider><BrowserCameraProvider><BrowserRouter>
      <StarsBackground starColor="var(--star-color)" className="app-shell flex h-dvh w-full text-slate-100 font-mono">
        <Sidebar />

        <div className="app-content flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
          <Header
            systemStatus={systemStatus}
            unreadAlertsCount={unreadAlertsCount}
            onOpenAlerts={() => (window.location.href = '/alerts')}
            onRefresh={fetchAllData}
          />

          <main className="min-w-0 flex-1">
            {!systemStatus && <div role="status" className="m-4 rounded-lg border border-amber-700 bg-amber-950 p-3 text-xs text-amber-200">Connecting to backend. Live camera and detection status are unavailable until the connection is restored.</div>}
            {systemStatus?.camera_enabled && systemStatus?.camera_error && <div role="status" className="m-4 rounded-lg border border-amber-700 bg-amber-950 p-3 text-xs text-amber-200">{systemStatus.camera_error}</div>}
            {systemStatus?.model_error && <div role="alert" className="m-4 rounded-lg border border-red-700 bg-red-950 p-3 text-xs text-red-200">YOLO: {systemStatus.model_error}</div>}
            <Routes>
              <Route
                path="/"
                element={
                  <DashboardPage
                    survivors={survivors}
                    alerts={alerts}
                    teams={teams}
                    drone={drone}
                    systemStatus={systemStatus}
                    onRefresh={fetchAllData}
                  />
                }
              />
              <Route
                path="/dashboard"
                element={<Navigate to="/" replace />}
              />
              <Route
                path="/live-mission"
                element={
                  <LiveMissionPage
                    survivors={survivors}
                    hazards={hazards}
                    teams={teams}
                    drone={drone}
                    onDispatchTeam={async (s, t) => {
                      await api.dispatchMission('M-101', s.survivor_id, t.team_id);
                      fetchAllData();
                    }}
                  />
                }
              />
              <Route
                path="/ai-detection"
                element={<AIDetectionPage survivors={survivors} systemStatus={systemStatus} onRefresh={fetchAllData} />}
              />
              <Route
                path="/disaster-map"
                element={
                  <DisasterMapPage
                    survivors={survivors}
                    hazards={hazards}
                    teams={teams}
                    drone={drone}
                    onRefresh={fetchAllData}
                  />
                }
              />
              <Route
                path="/drone-fleet"
                element={<DroneFleetPage drone={drone} onRefresh={fetchAllData} lastUpdated={droneUpdatedAt} />}
              />
              <Route path="/missions" element={<MissionsPage missions={missions} survivors={survivors} />} />
              <Route
                path="/alerts"
                element={
                  <AlertCenterPage
                    alerts={alerts}
                    survivors={survivors}
                    teams={teams}
                    onRefresh={fetchAllData}
                  />
                }
              />
              <Route
                path="/rescue-ops"
                element={<RescueOpsPage survivors={survivors} teams={teams} onRefresh={fetchAllData} />}
              />
              <Route path="/emergency-payload" element={<EmergencyPayloadPage />} />
              <Route path="/analytics" element={<AnalyticsPage survivors={survivors} teams={teams} loading={dataLoading} error={dataError} lastUpdated={lastUpdated} onRefresh={fetchAllData} />} />
              <Route
                path="/settings"
                element={<SettingsPage systemStatus={systemStatus} onRefresh={fetchAllData} />}
              />
            </Routes>
          </main>
        </div>
      </StarsBackground>
    </BrowserRouter></BrowserCameraProvider></DeviceLocationProvider>
  );
}

export default App;

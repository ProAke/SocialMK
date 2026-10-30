import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider, useI18n } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/Shell';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { CalendarPage } from './pages/Calendar';
import { StudioPage } from './pages/Studio';
import { CampaignsPage } from './pages/Campaigns';
import { AnalyticsPage } from './pages/Analytics';
import { AudiencePage } from './pages/Audience';
import { ConnectionsPage } from './pages/Connections';
import { TeamPage } from './pages/Team';
import { DevelopersPage } from './pages/Developers';
import { SettingsPage } from './pages/Settings';
import { InvitePage } from './pages/Invite';

function Splash() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--muted)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(135deg,#7c7cf0,#5b5bd6 55%,#2fb9a0)',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          S
        </span>
        <span style={{ fontSize: 13, letterSpacing: 0.4 }}>SocialMK · Beta</span>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage title={t('login.welcome')} />;
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<OverviewPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/campaigns" element={<CampaignsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/audience" element={<AudiencePage />} />
                <Route path="/connections" element={<ConnectionsPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/developers" element={<DevelopersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

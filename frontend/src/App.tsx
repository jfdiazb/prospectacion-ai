import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@context/AuthContext';
import { ProtectedRoute } from '@components/ProtectedRoute';
import { DashboardPage } from '@pages/DashboardPage';
import { LeadsPage } from '@pages/LeadsPage';
import { LoginPage } from '@pages/LoginPage';
import { RegisterPage } from '@pages/RegisterPage';
import { AutomationPage } from '@pages/AutomationPage';
import { CrmPage } from '@pages/CrmPage';
import { ProfilePage } from '@pages/ProfilePage';
import { SettingsPage } from '@pages/SettingsPage';
import { HunterPage } from '@pages/HunterPage';
import { ScraperPage } from '@pages/ScraperPage';
import { NotFoundPage } from '@pages/NotFoundPage';
import { YouTubeMonitorPage } from '@pages/YouTubeMonitorPage';

function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 text-white">
        <p>Cargando aplicación...</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prospectos"
          element={
            <ProtectedRoute>
              <LeadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/automatizaciones"
          element={
            <ProtectedRoute>
              <AutomationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <ProtectedRoute>
              <CrmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lead-hunter"
          element={
            <ProtectedRoute>
              <HunterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/social-scraper"
          element={
            <ProtectedRoute>
              <ScraperPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/youtube-monitor"
          element={<ProtectedRoute><YouTubeMonitorPage /></ProtectedRoute>}
        />
        <Route
          path="/configuracion"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
}

export default App

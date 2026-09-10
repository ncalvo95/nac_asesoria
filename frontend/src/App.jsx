import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { InstallPromptProvider } from './context/InstallPromptContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import CoachClientLayout from './components/CoachClientLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import InvitePage from './pages/InvitePage.jsx';
import GuestPage from './pages/GuestPage.jsx';
import HomePage from './pages/HomePage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import EntrenamientoPage from './pages/EntrenamientoPage.jsx';
import RutinasPage from './pages/RutinasPage.jsx';
import ProgresoPage from './pages/ProgresoPage.jsx';
import CoachPage from './pages/CoachPage.jsx';
import CatalogoPage from './pages/CatalogoPage.jsx';
import ReportesPage from './pages/ReportesPage.jsx';
import PreferenciasPage from './pages/PreferenciasPage.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <InstallPromptProvider>
        <AuthProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/invitacion" element={<InvitePage />} />
              <Route path="/invitacion/:code" element={<InvitePage />} />
              <Route path="/invitado" element={<GuestPage />} />
              <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/coach/clientes/:usuarioId/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/entrenamiento" element={<EntrenamientoPage />} />
                <Route path="/rutinas" element={<RutinasPage />} />
                <Route path="/progreso" element={<ProgresoPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
              </Route>
              <Route path="/coach" element={<ProtectedRoute><CoachPage /></ProtectedRoute>} />
              <Route path="/catalogo" element={<ProtectedRoute><CatalogoPage /></ProtectedRoute>} />
              <Route path="/coach/clientes/:usuarioId" element={<ProtectedRoute><CoachClientLayout /></ProtectedRoute>}>
                <Route path="entrenamiento" element={<EntrenamientoPage />} />
                <Route path="rutinas" element={<RutinasPage />} />
                <Route path="progreso" element={<ProgresoPage />} />
                <Route path="reportes" element={<ReportesPage />} />
                <Route path="preferencias" element={<PreferenciasPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </InstallPromptProvider>
    </ThemeProvider>
  );
}

    import React from 'react';
    import '@/App.css';
    import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
    import { AuthProvider, useAuth } from '@/lib/AuthContext';
    import { PlayerProvider } from '@/lib/PlayerContext';
    import { Sidebar } from '@/components/layout/Sidebar';
    import { PlayerBar } from '@/components/layout/PlayerBar';
    import { Toaster } from '@/components/ui/sonner';
    import { Home, Search, Library, BarChart3, MessageCircle } from 'lucide-react';

    const adminMode = process.env.REACT_APP_ADMIN_MODE === 'true';

    const AuthPage = React.lazy(() => import('@/pages/AuthPage'));
    const AdminLoginPage = React.lazy(() => import('@/pages/AdminLoginPage'));
    const GoogleAuthPage = React.lazy(() => import('@/pages/GoogleAuthPage'));
    const HomePage = React.lazy(() => import('@/pages/HomePage'));
    const SearchPage = React.lazy(() => import('@/pages/SearchPage'));
    const LibraryPage = React.lazy(() => import('@/pages/LibraryPage'));
    const PlaylistPage = React.lazy(() => import('@/pages/PlaylistPage'));
    const ArtistPage = React.lazy(() => import('@/pages/ArtistPage'));
    const AlbumPage = React.lazy(() => import('@/pages/AlbumPage'));
    const DNAPage = React.lazy(() => import('@/pages/DNAPage'));
    const LyraPage = React.lazy(() => import('@/pages/LyraPage'));
    const AdminPage = React.lazy(() => import('@/pages/AdminPage'));

    const LoadingScreen = () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-end gap-1 h-8">
          <div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" />
        </div>
      </div>
    );

    const SuspenseShell = ({ children }) => (
      <React.Suspense fallback={<LoadingScreen />}>
        {children}
      </React.Suspense>
    );

    const ProtectedRoute = ({ children }) => {
      const { isAuthenticated, loading } = useAuth();
      if (loading) return <LoadingScreen />;
      return isAuthenticated ? children : <Navigate to={adminMode ? '/admin/login' : '/auth'} replace />;
    };

    const AdminProtectedRoute = ({ children }) => {
      const { user, loading } = useAuth();
      if (loading) return <LoadingScreen />;
      return user?.is_admin ? children : <Navigate to="/admin/login" replace />;
    };

    const MobileNav = () => {
      const navItems = [
        { to: '/', icon: Home, label: 'Home' },
        { to: '/search', icon: Search, label: 'Search' },
        { to: '/library', icon: Library, label: 'Library' },
        { to: '/dna', icon: BarChart3, label: 'DNA' },
        { to: '/lyra', icon: MessageCircle, label: 'LYRA' },
      ];

      return (
        <div className="mobile-nav md:hidden">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`mobile-nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition-colors duration-200 ${
                  isActive ? 'text-primary' : 'text-zinc-500'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      );
    };

    const AppLayout = ({ children }) => (
      <div className="min-h-screen bg-background relative">
        <div className="noise-overlay" />
        <Sidebar />
        <MobileNav />
        <main className="md:pl-64 pb-32 min-h-screen relative z-10 pt-16 md:pt-0">
          <SuspenseShell>{children}</SuspenseShell>
        </main>
        <PlayerBar />
      </div>
    );

    const AdminPortalLayout = ({ children }) => (
      <div className="min-h-screen bg-background relative">
        <div className="noise-overlay" />
        <main className="min-h-screen relative z-10">
          <SuspenseShell>{children}</SuspenseShell>
        </main>
        <PlayerBar />
      </div>
    );

    const DefaultRoutes = () => (
      <Routes>
        <Route path="/auth" element={<SuspenseShell><AuthPage /></SuspenseShell>} />
        <Route path="/auth/google" element={<SuspenseShell><GoogleAuthPage /></SuspenseShell>} />
        <Route path="/admin/login" element={<SuspenseShell><AdminLoginPage /></SuspenseShell>} />
        <Route
          path="/admin"
          element={(
            <AdminProtectedRoute>
              <AdminPortalLayout>
                <AdminPage />
              </AdminPortalLayout>
            </AdminProtectedRoute>
          )}
        />
        <Route
          path="/*"
          element={(
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/playlist/:id" element={<PlaylistPage />} />
                  <Route path="/artist/:id" element={<ArtistPage />} />
                  <Route path="/album/:id" element={<AlbumPage />} />
                  <Route path="/dna" element={<DNAPage />} />
                  <Route path="/lyra" element={<LyraPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          )}
        />
      </Routes>
    );

    const AdminPortalRoutes = () => {
      const { user, isAuthenticated } = useAuth();
      const adminHome = isAuthenticated && user?.is_admin ? '/admin' : '/admin/login';

      return (
        <Routes>
          <Route path="/" element={<Navigate to={adminHome} replace />} />
          <Route path="/admin/login" element={<SuspenseShell><AdminLoginPage /></SuspenseShell>} />
          <Route
            path="/admin"
            element={(
              <AdminProtectedRoute>
                <AdminPortalLayout>
                  <AdminPage />
                </AdminPortalLayout>
              </AdminProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to={adminHome} replace />} />
        </Routes>
      );
    };

    const AppRoutes = () => (adminMode ? <AdminPortalRoutes /> : <DefaultRoutes />);

    function App() {
      return (
        <BrowserRouter>
          <AuthProvider>
            <PlayerProvider>
              <Toaster position="bottom-center" />
              <AppRoutes />
            </PlayerProvider>
          </AuthProvider>
        </BrowserRouter>
      );
    }

    export default App;

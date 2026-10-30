import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { get, onApiError, post } from './lib/api';
import { useStore } from './lib/store';
import { applyTheme } from './lib/theme';
import { connectSocket, disconnectSocket } from './lib/socket';
import { queryClient } from './lib/query';
import type { Me, PublicSettings } from './lib/types';
import { Toaster } from './components/toast';
import { Spinner } from './components/ui';
import { ForgotPassword, Gate, Landing, Login, Maintenance, Register, ResetPassword, VerifyEmail } from './pages/public/PublicPages';

const AppShell = lazy(() => import('./pages/app/AppShell'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));

function FullScreenSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <Spinner className="size-7" />
    </div>
  );
}

export function App() {
  const me = useStore((s) => s.me);
  const community = useStore((s) => s.community);
  const [ready, setReady] = useState(false);
  const [maintenance, setMaintenance] = useState<string | null>(null);
  const navigate = useNavigate();

  const refreshMe = useCallback(async () => {
    try {
      const m = await get<Me>('/auth/me');
      useStore.getState().setMe(m);
      return m;
    } catch {
      useStore.getState().setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const c = await get<PublicSettings>('/public/community').catch(() => null);
      if (c) useStore.getState().setCommunity(c);
      await refreshMe();
      setReady(true);
    })();
  }, [refreshMe]);

  // Session-level failures from any request.
  useEffect(() => {
    const off = onApiError((err) => {
      if (err.status === 401 && useStore.getState().me) {
        useStore.getState().setMe(null);
        disconnectSocket();
        navigate('/login');
      } else if (err.code.startsWith('ACCOUNT_')) void refreshMe().then(() => navigate('/gate'));
      else if (err.code === 'MAINTENANCE') setMaintenance(err.message);
    });
    const check = () => void refreshMe();
    window.addEventListener('ouroboros:session-check', check);
    return () => {
      off();
      window.removeEventListener('ouroboros:session-check', check);
    };
  }, [navigate, refreshMe]);

  useEffect(() => {
    applyTheme(me?.preferences, community?.appearance);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const fn = () => applyTheme(useStore.getState().me?.preferences, useStore.getState().community?.appearance);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [me?.preferences, community?.appearance]);

  useEffect(() => {
    document.title = community?.communityName ?? 'Ouroboros';
  }, [community?.communityName]);

  useEffect(() => {
    if (me?.state === 'ok') {
      setMaintenance(null);
      connectSocket();
    } else disconnectSocket();
  }, [me?.state]);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    disconnectSocket();
    queryClient.clear();
    useStore.setState({ me: null, channels: {}, timelines: {}, conversations: [] });
    navigate('/');
  }, [navigate]);

  if (!ready) return <FullScreenSpinner />;
  if (maintenance && !me?.permissions.includes('manage_settings')) return <Maintenance message={maintenance} onLogout={me ? logout : undefined} />;

  const authed = me?.state === 'ok';
  return (
    <>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={me ? <Navigate to={authed ? '/app' : '/gate'} replace /> : <Login onLogin={(m) => useStore.getState().setMe(m)} />} />
          <Route path="/register" element={me ? <Navigate to="/gate" replace /> : <Register />} />
          <Route path="/verify-email" element={<VerifyEmail onDone={() => void refreshMe()} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/gate" element={<Gate onLogout={logout} onRefresh={() => void refreshMe()} />} />
          <Route path="/app/*" element={authed ? <AppShell onLogout={logout} /> : <Navigate to={me ? '/gate' : '/login'} replace />} />
          <Route path="/admin/*" element={authed && me.isStaff ? <AdminLayout /> : <Navigate to={authed ? '/app' : '/login'} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}

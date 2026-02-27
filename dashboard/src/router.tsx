import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing'));
const Demo = lazy(() => import('./pages/Demo'));
const Findings = lazy(() => import('./pages/Findings'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));

const RouteFallback = (
  <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">
    Loading...
  </div>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Suspense fallback={RouteFallback}><Landing /></Suspense>,
  },
  {
    path: '/demo',
    element: <Suspense fallback={RouteFallback}><Demo /></Suspense>,
  },
  {
    path: '/findings',
    element: <Suspense fallback={RouteFallback}><Findings /></Suspense>,
  },
  {
    path: '/dashboard',
    element: <Suspense fallback={RouteFallback}><DashboardPage /></Suspense>,
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

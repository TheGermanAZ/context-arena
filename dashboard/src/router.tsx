import { createBrowserRouter, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Demo from './pages/Demo';
import DashboardPage from './pages/Dashboard';

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/demo', element: <Demo /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

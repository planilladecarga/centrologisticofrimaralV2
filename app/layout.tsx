import type {Metadata} from 'next';
import './globals.css';
import { ToastProvider } from '../contexts/ToastContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuditLogProvider } from '../contexts/AuditLogContext';
import { AuthProvider } from '../contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Frimaral - Centro Logístico',
  description: 'Sistema de gestión logística y control de inventario para Frimaral',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <ThemeProvider>
            <AuditLogProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AuditLogProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

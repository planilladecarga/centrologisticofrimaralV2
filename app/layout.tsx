import type {Metadata} from 'next';
import './globals.css';
import { ToastProvider } from '../contexts/ToastContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuditLogProvider } from '../contexts/AuditLogContext';
import { AuthProvider } from '../contexts/AuthContext';

export const metadata: Metadata = {
  title: 'Frimaral - Centro Logístico',
  description: 'Sistema de gestión logística y control de inventario para Frimaral',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: '(function(){try{var d=localStorage.getItem("frimaral_dark_mode");var t=d==="true"?"dark":d==="false"?"light":window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()' }} />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="manifest.json" />
        <link rel="icon" href="favicon.ico" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png" />
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

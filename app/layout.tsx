import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Centro Logístico Frimaral V2',
  description: 'Sistema de gestión logística para Centro Logístico Frimaral - Inventario, Despachos y Control Operativo',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

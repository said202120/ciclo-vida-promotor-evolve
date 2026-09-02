import type { Metadata } from 'next';
import AmbientBackground from '@/components/AmbientBackground';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ciclo de vida del promotor',
  description: 'OKR de Operaciones · Evolve',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}

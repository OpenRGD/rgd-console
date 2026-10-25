import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRGD Console',
  description: 'Offline-first console per l’osservabilità robotica OpenRGD',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body className="bg-canvas text-slate-100 antialiased">{children}</body></html>;
}

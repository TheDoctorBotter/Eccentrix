import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider } from '@/lib/auth-context';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Eccentrix EMR',
  description: 'Secure clinical documentation and patient chart management',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Eccentrix EMR',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#1a3a5c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={inter.className}>
        <ServiceWorkerRegistration />
        <AuthProvider>
          <div className="bg-red-600 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium sticky top-0 z-50 shadow-md">
            <AlertTriangle className="h-4 w-4" />
            <span>DRAFT DOCUMENTATION – Clinician must review all generated content. Do not enter PHI or protected health information.</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

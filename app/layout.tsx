import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Buckeye EMR',
  description: 'Electronic Medical Records for Physical Therapy',
  openGraph: {
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './style.css';

export const metadata: Metadata = {
  title: 'Phong Daily Press — Human-First AI Newsroom',
  description:
    'A bilingual digital newsroom where human writing quality comes first. No generic AI voice. No motivational clichés.',
  robots: { index: false, follow: false }, // private tool — no public indexing
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

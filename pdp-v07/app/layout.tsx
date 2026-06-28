import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './style.css';

export const metadata: Metadata = {
  title: 'Phong Daily Press — Insight OS v0.7',
  description: 'AI Investigative Newsroom. One person. Deep research. Sharp writing.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

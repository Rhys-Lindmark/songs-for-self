import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Mono, Inter } from 'next/font/google';
import './globals.css';

const serif = Cormorant_Garamond({ variable: '--font-serif', subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'] });
const sans = Inter({ variable: '--font-sans', subsets: ['latin'] });
const mono = DM_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['300', '400', '500'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://ai.rhyslindmark.com/music'),
  title: 'Songs for Self — A personal atlas of listening',
  description: '7,582 available tracks from a 7,733-position playlist, visualized across genre, musical time, and geography.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Songs for Self',
    description: '7,582 available tracks across musical time, genre, and place.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Songs for Self music timeline' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Songs for Self',
    description: '7,582 available tracks across musical time, genre, and place.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>{children}</body></html>;
}

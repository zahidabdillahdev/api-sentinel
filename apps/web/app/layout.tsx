import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = { title: 'API Sentinel', description: 'API quality and contract testing workspace' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'TrustFlow AI — Make a deal. Build trust.', description: 'Turn agreements into clear, trackable transactions with AI-assisted scope and delivery checks.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }

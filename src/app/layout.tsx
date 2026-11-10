import type { Metadata } from 'next';
import './globals.css';
import {FloatingAskAI} from '@/components/floating-ask-ai';
import {WorkspaceDock} from '@/components/workspace-dock';

export const metadata: Metadata = {
  title: 'TrustFlow AI — Make a deal. Build trust.',
  description: 'Turn agreements into clear, trackable transactions with AI-assisted scope and delivery checks.'
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><body>{children}<WorkspaceDock/><FloatingAskAI/></body></html>;
}

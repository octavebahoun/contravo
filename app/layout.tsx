import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const display = Bricolage_Grotesque({ subsets: ['latin-ext'], variable: '--font-display', preload: false });
const sans = Instrument_Sans({ subsets: ['latin-ext'], variable: '--font-sans', preload: false });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', preload: false });

export const metadata: Metadata = {
  title: 'Contravo — Devis, contrats et factures signés en ligne',
  description:
    'Créez un devis en 5 minutes, envoyez le lien, votre client signe depuis son téléphone et paie par mobile money. Devis, contrats, factures et paiements pour prestataires francophones.',
};

export const viewport: Viewport = {
  maximumScale: 1
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const team = await getTeamForUser();

  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={cn("bg-background text-foreground font-sans antialiased", display.variable, sans.variable, mono.variable)}
    >
      <body className="min-h-[100dvh] bg-background" suppressHydrationWarning>
        <SWRConfig
          value={{
            fallback: {
              '/api/user': user,
              '/api/team': team
            }
          }}
        >
          <TooltipProvider>{children}</TooltipProvider>
        </SWRConfig>
      </body>
    </html>
  );
}
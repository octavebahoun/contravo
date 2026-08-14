import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Next.js SaaS Starter',
  description: 'Gestion de devis, contrats, factures et paiements pour prestataires.'
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
      lang="en"
      suppressHydrationWarning
      className={cn("bg-white dark:bg-gray-950 text-black dark:text-white font-sans", "font-sans", inter.variable)}
    >
      <body className="min-h-[100dvh] bg-gray-50" suppressHydrationWarning>
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


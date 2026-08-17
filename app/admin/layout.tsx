import type { ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 bg-card">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-xs px-2.5 py-0.5 font-semibold rounded-full bg-destructive/10 text-destructive">
            Espace Super-Admin
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 bg-muted/50">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
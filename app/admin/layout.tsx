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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 bg-white dark:bg-gray-950">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-xs px-2.5 py-0.5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Espace Super-Admin
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/40">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen, LayoutDashboard, Settings2, ShieldCheck } from 'lucide-react';
import useSWR from 'swr';

import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { User } from '@/lib/db/schema';

/**
 * Application sidebar (layout from the shadcn `sidebar-08` block).
 *
 * Only lists routes that exist. The business modules — clients, projects,
 * quotes, contracts, invoices — have no screens yet, so adding them here would
 * mean shipping links to 404s; they go in once their pages are built.
 */

const navMain = [
  { title: 'Tableau de bord', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Activité', url: '/dashboard/activity', icon: Activity },
];

const navSettings = [
  { title: 'Général', url: '/dashboard/general', icon: Settings2 },
  { title: 'Sécurité', url: '/dashboard/security', icon: ShieldCheck },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { data: user } = useSWR<User>('/api/user', fetcher);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <Image
                  src="/logo.webp"
                  alt="Contravo"
                  width={120}
                  height={32}
                  className="h-8 w-auto object-contain"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navMain.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={pathname === item.url}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Paramètres</SidebarGroupLabel>
          <SidebarMenu>
            {navSettings.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={pathname === item.url}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="sm">
                <Link href="/api/v1/docs">
                  <BookOpen />
                  <span>Documentation API</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: user?.fullName || user?.email?.split('@')[0] || 'Utilisateur',
            email: user?.email || '',
            avatar: '',
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

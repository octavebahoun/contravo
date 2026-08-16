"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  Building2,
  CircleDollarSign,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react"
import { NavUser } from "@/components/nav-user"

const data = {
  adminNav: [
    { title: "Vue d'ensemble", url: "/admin", icon: LayoutDashboard },
    { title: "Organisations", url: "/admin/organizations", icon: Building2 },
    { title: "Finances & Factures", url: "/admin/finance", icon: CircleDollarSign },
  ],
}

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const fetcher = React.useCallback((url: string) => fetch(url).then((res) => res.json()), [])
  const { data: userData } = useSWR("/api/user", fetcher)

  const sidebarUser = React.useMemo(() => {
    return {
      name: userData?.fullName || userData?.name || "Chargement...",
      email: userData?.email || "",
      avatar: "",
    }
  }, [userData])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-border p-4 flex flex-row items-center gap-2">
        <ShieldAlert className="size-6 text-primary shrink-0" />
        <div className="flex flex-col truncate">
          <span className="font-semibold text-sm leading-tight text-primary">Super-Admin</span>
          <span className="text-xs text-muted-foreground">Contravo Governance</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Admin</SidebarGroupLabel>
          <SidebarMenu>
            {data.adminNav.map((item) => {
              const isActive = pathname === item.url
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Retour au portail">
                <Link href="/dashboard">
                  <ArrowLeft className="text-muted-foreground" />
                  <span className="text-muted-foreground">Retour au portail</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

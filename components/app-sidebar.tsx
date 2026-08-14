"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  Users,
  Building2,
  FolderKanban,
  FileText,
  FileSpreadsheet,
  CreditCard,
  Settings,
  Activity,
  Shield,
  Layers,
  Code2,
} from "lucide-react"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"

const data = {
  user: {
    name: "Contravo User",
    email: "user@contravo.com",
    avatar: "/avatars/user.jpg",
  },
  teams: [
    {
      name: "Contravo Enterprise",
      logo: <Layers className="size-4" />,
      plan: "SaaS Platform",
    },
  ],
  mainNav: [
    { title: "Team", url: "/dashboard", icon: Users },
    { title: "Clients (CRM)", url: "/dashboard/clients", icon: Building2 },
    { title: "Projets", url: "/dashboard/projects", icon: FolderKanban },
    { title: "Factures", url: "/dashboard/invoices", icon: FileText },
    { title: "Devis", url: "/dashboard/quotes", icon: FileSpreadsheet },
    { title: "Abonnement", url: "/dashboard/billing", icon: CreditCard },
  ],
  settingsNav: [
    { title: "Développeurs", url: "/dashboard/developer", icon: Code2 },
    { title: "Général", url: "/dashboard/general", icon: Settings },
    { title: "Activité", url: "/dashboard/activity", icon: Activity },
    { title: "Sécurité", url: "/dashboard/security", icon: Shield },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
          <SidebarMenu>
            {data.mainNav.map((item) => {
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
          <SidebarGroupLabel>Paramètres</SidebarGroupLabel>
          <SidebarMenu>
            {data.settingsNav.map((item) => {
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
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

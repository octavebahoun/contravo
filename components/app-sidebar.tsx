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

  const fetcher = React.useCallback((url: string) => fetch(url).then((res) => res.json()), [])

  const { data: userData } = useSWR("/api/user", fetcher)
  const { data: activeTeam } = useSWR("/api/team", fetcher)
  const { data: orgsData } = useSWR("/api/v1/organizations", fetcher)

  const sidebarUser = React.useMemo(() => {
    return {
      name: userData?.fullName || userData?.name || "Chargement...",
      email: userData?.email || "",
      avatar: "/avatars/user.jpg",
    }
  }, [userData])

  const sidebarTeams = React.useMemo(() => {
    if (!orgsData?.organizations) return []
    return orgsData.organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      logo: <Layers className="size-4" />,
      plan: org.id === activeTeam?.id ? (activeTeam?.planName || "SaaS Platform") : "SaaS Platform",
    }))
  }, [orgsData, activeTeam])

  const currentActiveTeam = React.useMemo(() => {
    if (!activeTeam) return undefined
    return {
      id: activeTeam.id,
      name: activeTeam.name,
      logo: <Layers className="size-4" />,
      plan: activeTeam.planName || "SaaS Platform",
    }
  }, [activeTeam])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarTeams} activeTeam={currentActiveTeam} />
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
        <NavUser user={sidebarUser} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

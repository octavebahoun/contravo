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
  Users,
  Building2,
  FolderKanban,
  FileText,
  FileSpreadsheet,
  FileSignature,
  Package,
  Receipt,
  MessageSquareQuote,
  FolderOpen,
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
    { title: "Vue d'ensemble", url: "/dashboard", icon: LayoutDashboard },
    { title: "Clients (CRM)", url: "/dashboard/clients", icon: Building2 },
    { title: "Projets", url: "/dashboard/projects", icon: FolderKanban },
    { title: "Devis", url: "/dashboard/quotes", icon: FileSpreadsheet },
    { title: "Contrats", url: "/dashboard/contracts", icon: FileSignature },
    { title: "Factures", url: "/dashboard/invoices", icon: FileText },
    { title: "Livrables", url: "/dashboard/deliverables", icon: Package },
    { title: "Dépenses", url: "/dashboard/expenses", icon: Receipt },
    { title: "Avis clients", url: "/dashboard/reviews", icon: MessageSquareQuote },
    { title: "Fichiers", url: "/dashboard/files", icon: FolderOpen },
    { title: "Abonnement", url: "/dashboard/billing", icon: CreditCard },
  ],
  settingsNav: [
    { title: "Équipe", url: "/dashboard/team", icon: Users },
    { title: "Développeurs", url: "/dashboard/developer", icon: Code2 },
    { title: "Général", url: "/dashboard/general", icon: Settings },
    { title: "Activité", url: "/dashboard/activity", icon: Activity },
    { title: "Sécurité", url: "/dashboard/security", icon: Shield },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const fetcher = React.useCallback((url: string) => fetch(url).then((res) => res.json()), [])

  const { data: userData } = useSWR("/api/user", fetcher)
  const { data: activeTeam } = useSWR("/api/team", fetcher)
  const { data: orgsData } = useSWR("/api/v1/organizations", fetcher)

  const sidebarUser = React.useMemo(() => {
    return {
      name: userData?.fullName || userData?.name || "Chargement...",
      email: userData?.email || "",
      avatar: "",
    }
  }, [userData])

  const sidebarTeams = React.useMemo(() => {
    if (!mounted || !orgsData?.organizations) return []
    return orgsData.organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      logo: <Layers className="size-4" />,
      plan: org.id === activeTeam?.id ? (activeTeam?.planName || "SaaS Platform") : "SaaS Platform",
    }))
  }, [orgsData, activeTeam, mounted])

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
            {data.settingsNav.filter(item => {
              if (item.url === "/dashboard/developer") {
                const currentUserMember = activeTeam?.teamMembers?.find(
                  (m: any) => m.user?.id === userData?.id
                );
                return currentUserMember?.role === "owner" || currentUserMember?.role === "admin";
              }
              return true;
            }).map((item) => {
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

        {userData?.isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/admin')} tooltip="Super-Admin">
                  <Link href="/admin">
                    <Shield className="text-primary" />
                    <span className="font-semibold text-primary">Super-Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

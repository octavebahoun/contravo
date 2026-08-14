"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon, PlusIcon, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export function TeamSwitcher({
  teams,
  activeTeam,
}: {
  teams: {
    id: string
    name: string
    logo: React.ReactNode
    plan: string
  }[]
  activeTeam?: {
    id: string
    name: string
    logo: React.ReactNode
    plan: string
  }
}) {
  const { isMobile } = useSidebar()
  const [isOpen, setIsOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setName(val)
    // Auto-generate slug
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    )
  }

  const handleSwitchTeam = (teamId: string) => {
    document.cookie = `organization_id=${teamId}; path=/; max-age=31536000; SameSite=Lax`
    window.location.reload()
  }

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/v1/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error?.message || "Une erreur est survenue lors de la création.")
      }

      const data = await res.json()
      // Switch to the newly created organization
      document.cookie = `organization_id=${data.organization.id}; path=/; max-age=31536000; SameSite=Lax`
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const currentTeam = activeTeam || teams[0]

  if (!currentTeam) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            onClick={() => setIsOpen(true)}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <PlusIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Create organization</span>
              <span className="truncate text-xs">No active team</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <form onSubmit={handleCreateTeam}>
              <DialogHeader>
                <DialogTitle>Créer une organisation</DialogTitle>
                <DialogDescription>
                  Ajoutez une nouvelle organisation pour commencer à gérer vos clients et projets.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nom de l'organisation</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Mon Entreprise"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Slug unique (URL)</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="mon-entreprise"
                    required
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenu>
    )
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {currentTeam.logo}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{currentTeam.name}</span>
                  <span className="truncate text-xs">{currentTeam.plan}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organisations
              </DropdownMenuLabel>
              {teams.map((team, index) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => handleSwitchTeam(team.id)}
                  className="gap-2 p-2 cursor-pointer"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    {team.logo}
                  </div>
                  <span className="flex-1 truncate">{team.name}</span>
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 p-2 cursor-pointer"
                onClick={() => {
                  setName("")
                  setSlug("")
                  setError(null)
                  setIsOpen(true)
                }}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Créer une équipe</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <form onSubmit={handleCreateTeam}>
            <DialogHeader>
              <DialogTitle>Créer une organisation</DialogTitle>
              <DialogDescription>
                Ajoutez une nouvelle organisation pour commencer à gérer vos clients et projets.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nom de l'organisation</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={handleNameChange}
                  placeholder="Mon Entreprise"
                  required
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug unique (URL)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mon-entreprise"
                  required
                  disabled={loading}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

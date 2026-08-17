'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Code2, Copy, Check, Plus, ShieldCheck, Webhook, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { WebhookEndpoints } from './_components/webhook-endpoints';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt?: string;
  createdAt: string;
}

export default function DeveloperPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCreatedKey, setNewCreatedKey] = useState<string | null>(null);

  // Form
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'invoices:read',
    'quotes:read',
    'projects:read',
  ]);

  const { data: userData } = useSWR('/api/user', fetcher);
  const { data: activeTeam } = useSWR('/api/team', fetcher);

  const { data: keysData, isLoading, mutate } = useSWR<{ apiKeys: ApiKeyItem[] }>(
    '/api/v1/api-keys',
    fetcher
  );

  const currentUserMember = activeTeam?.teamMembers?.find(
    (member: any) => member.user?.id === userData?.id
  );
  
  const isAuthorized = currentUserMember?.role === 'owner' || currentUserMember?.role === 'admin';

  const apiKeysList = keysData?.apiKeys || [];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success('Copié dans le presse-papier !');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName) {
      toast.error('Veuillez entrer un nom pour la clé API');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName,
          scopes: selectedScopes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Erreur lors de la génération de la clé API');
      }

      const data = await res.json();
      setNewCreatedKey(data.secretKey || data.key || `${data.prefix}...secret_generated`);
      toast.success('Clé API générée avec succès');
      setKeyName('');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur création clé API');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleScope = (scope: string) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const sampleJsonWebhook = `{
  "event": "invoice.paid",
  "timestamp": "2026-08-14T17:00:00Z",
  "data": {
    "invoiceId": "inv_98457230495",
    "invoiceNumber": "FAC-2026-004",
    "amountPaidCents": 15000000,
    "currency": "XOF",
    "status": "paid",
    "clientId": "cli_309248239"
  }
}`;

  if (isLoading || !userData || !activeTeam) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8 flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">Accès restreint</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Cette section est réservée aux administrateurs de l'organisation. Veuillez contacter votre administrateur pour obtenir des accès.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            Espace Développeurs & API
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gérez vos clés API d'accès sécurisé et configurez vos Webhooks pour automatiser n8n ou Make.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={(val) => { setIsOpen(val); if (!val) setNewCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Générer une Clé API
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-xl">
            {newCreatedKey ? (
              <div className="space-y-4 py-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-foreground flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-accent" /> Clé API Générée !
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Copiez immédiatement votre clé API secrète. Elle ne sera plus affichée par la suite.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-muted text-muted-foreground p-4 rounded-xl font-mono text-xs break-all flex items-center justify-between gap-2">
                  <span>{newCreatedKey}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copier la clé API"
                    onClick={() => handleCopy(newCreatedKey)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {copiedKey === newCreatedKey ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => { setIsOpen(false); setNewCreatedKey(null); }}
                    className="w-full rounded-lg bg-primary text-primary-foreground text-xs h-10 font-semibold"
                  >
                    J'ai bien copié la clé
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleCreateKey}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-foreground">Créer une nouvelle clé API</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Définissez le nom et les permissions d'accès (scopes).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Nom de la clé *</Label>
                    <Input
                      placeholder="ex: Intégration n8n Prod"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-foreground">Permissions (Scopes)</Label>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {[
                        'invoices:read',
                        'invoices:write',
                        'quotes:read',
                        'quotes:write',
                        'projects:read',
                        'clients:read',
                      ].map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => toggleScope(scope)}
                          className={`text-left p-2 rounded-xl text-xs border transition-all ${
                            selectedScopes.includes(scope)
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border text-foreground hover:bg-muted'
                          }`}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Générer la Clé'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs Clés API & Webhooks */}
      <Tabs defaultValue="keys" className="space-y-6">
        <TabsList className="bg-muted/80 p-1 rounded-xl">
          <TabsTrigger value="keys" className="rounded-lg text-xs font-medium px-4 py-2">
            <Key className="mr-2 h-3.5 w-3.5" /> Clés API Active
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-lg text-xs font-medium px-4 py-2">
            <Webhook className="mr-2 h-3.5 w-3.5" /> Webhooks & n8n
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Clés API */}
        <TabsContent value="keys">
          <Card className="rounded-xl border border-border bg-card">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-sm font-medium text-foreground">Vos clés d'API secrètes</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Ces clés permettent d’authentifier vos appels serveur à serveur vers l'API Contravo.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : apiKeysList.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  Aucune clé d'API générée pour le moment.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-muted/50">
                      <TableHead className="text-xs font-semibold text-foreground">Nom de la Clé</TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">Préfixe</TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">Scopes</TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">Créée le</TableHead>
                      <TableHead className="text-xs font-semibold text-foreground text-right">Dernier usage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeysList.map((k) => (
                      <TableRow key={k.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-xs text-foreground flex items-center gap-2">
                          <Key className="h-4 w-4 text-primary" />
                          <span>{k.name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {k.prefix}...
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((sc) => (
                              <Badge key={sc} variant="outline" className="text-[10px] rounded-md font-mono">
                                {sc}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(k.createdAt).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('fr-FR') : 'Jamais'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Webhooks & Code Viewer */}
        <TabsContent value="webhooks">
          <div className="space-y-6">
            <WebhookEndpoints />

            {/* Zone de Code (JSON Code View) */}
            <Card className="rounded-xl border border-border bg-muted text-muted-foreground">
              <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xs font-mono text-muted-foreground">Exemple Payload JSON (invoice.paid)</CardTitle>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copier l'exemple de payload"
                  onClick={() => handleCopy(sampleJsonWebhook)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  {copiedKey === sampleJsonWebhook ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </CardHeader>
              <CardContent className="p-5">
                <pre className="font-mono text-xs text-info leading-relaxed overflow-x-auto">
                  {sampleJsonWebhook}
                </pre>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

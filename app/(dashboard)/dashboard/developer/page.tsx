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
        <Loader2 className="h-8 w-8 animate-spin text-[#0052ff]" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8 flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <ShieldCheck className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Accès restreint</h2>
          <p className="text-sm text-gray-500 mb-6">
            Cette section est réservée aux administrateurs de l'organisation. Veuillez contacter votre administrateur pour obtenir des accès.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Coinbase Blue */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
            Espace Développeurs & API
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Gérez vos clés API d'accès sécurisé et configurez vos Webhooks pour automatiser n8n ou Make.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={(val) => { setIsOpen(val); if (!val) setNewCreatedKey(null); }}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Générer une Clé API
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-2xl">
            {newCreatedKey ? (
              <div className="space-y-4 py-2">
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-[#0a0b0d] flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-[#05b169]" /> Clé API Générée !
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#5b616e]">
                    Copiez immédiatement votre clé API secrète. Elle ne sera plus affichée par la suite.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs break-all flex items-center justify-between gap-2">
                  <span>{newCreatedKey}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopy(newCreatedKey)}
                    className="h-8 w-8 text-gray-300 hover:text-white shrink-0"
                  >
                    {copiedKey === newCreatedKey ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => { setIsOpen(false); setNewCreatedKey(null); }}
                    className="w-full rounded-full bg-[#0052ff] text-white text-xs h-10 font-semibold"
                  >
                    J'ai bien copié la clé
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleCreateKey}>
                <DialogHeader>
                  <DialogTitle className="text-lg font-normal text-[#0a0b0d]">Créer une nouvelle clé API</DialogTitle>
                  <DialogDescription className="text-xs text-[#5b616e]">
                    Définissez le nom et les permissions d'accès (scopes).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Nom de la clé *</Label>
                    <Input
                      placeholder="ex: Intégration n8n Prod"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-[#0a0b0d]">Permissions (Scopes)</Label>
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
                              ? 'border-[#0052ff] bg-[#0052ff]/10 text-[#0052ff] font-medium'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
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
                    className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
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
        <TabsList className="bg-gray-100/80 p-1 rounded-xl">
          <TabsTrigger value="keys" className="rounded-lg text-xs font-medium px-4 py-2">
            <Key className="mr-2 h-3.5 w-3.5" /> Clés API Active
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="rounded-lg text-xs font-medium px-4 py-2">
            <Webhook className="mr-2 h-3.5 w-3.5" /> Webhooks & n8n
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Clés API */}
        <TabsContent value="keys">
          <Card className="rounded-2xl border border-gray-200 bg-white">
            <CardHeader className="p-5 border-b border-gray-100">
              <CardTitle className="text-sm font-medium text-[#0a0b0d]">Vos clés d'API secrètes</CardTitle>
              <CardDescription className="text-xs text-[#5b616e]">
                Ces clés permettent d’authentifier vos appels serveur à serveur vers l'API Contravo.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
                </div>
              ) : apiKeysList.length === 0 ? (
                <div className="text-center py-12 text-[#7c828a] text-xs">
                  Aucune clé d'API générée pour le moment.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-100 bg-[#f7f7f7]/50">
                      <TableHead className="text-xs font-semibold text-[#0a0b0d]">Nom de la Clé</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0a0b0d]">Préfixe</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0a0b0d]">Scopes</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0a0b0d]">Créée le</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Dernier usage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeysList.map((k) => (
                      <TableRow key={k.id} className="border-gray-100 hover:bg-gray-50/50">
                        <TableCell className="font-medium text-xs text-[#0a0b0d] flex items-center gap-2">
                          <Key className="h-4 w-4 text-[#0052ff]" />
                          <span>{k.name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#5b616e]">
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
                        <TableCell className="text-xs text-[#5b616e]">
                          {new Date(k.createdAt).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-right text-xs text-[#5b616e]">
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl border border-gray-200 bg-white">
              <CardHeader className="p-5">
                <CardTitle className="text-sm font-medium text-[#0a0b0d] flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-[#0052ff]" /> Endpoint Webhook n8n / Make
                </CardTitle>
                <CardDescription className="text-xs text-[#5b616e]">
                  Configurez l'URL qui recevra automatiquement les événements en temps réel.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">URL Webhook de Réception</Label>
                  <Input
                    defaultValue="https://n8n.votre-domaine.com/webhook/contravo-events"
                    className="rounded-xl text-xs font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-[#0a0b0d]">Événements Écoutés</Label>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">invoice.paid</Badge>
                      <span>Déclenché dès qu'un paiement GeniusPay est encaissé</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700 mt-2">
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">quote.accepted</Badge>
                      <span>Déclenché lorsqu'un client valide un devis</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-10">
                  Enregistrer l'Endpoint
                </Button>
              </CardContent>
            </Card>

            {/* Zone de Code (JSON Code View) */}
            <Card className="rounded-2xl border border-gray-200 bg-gray-950 text-gray-100">
              <CardHeader className="p-5 border-b border-gray-800 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-[#0052ff]" />
                  <CardTitle className="text-xs font-mono text-gray-200">Exemple Payload JSON (invoice.paid)</CardTitle>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleCopy(sampleJsonWebhook)}
                  className="h-7 w-7 text-gray-400 hover:text-white"
                >
                  {copiedKey === sampleJsonWebhook ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </CardHeader>
              <CardContent className="p-5">
                <pre className="font-mono text-xs text-blue-300 leading-relaxed overflow-x-auto">
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

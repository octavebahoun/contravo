'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_WILDCARD,
} from '@/lib/webhooks/events';

/**
 * Outbound webhook endpoint management.
 *
 * Replaces a card that only looked functional: a placeholder URL in an
 * uncontrolled input, two hardcoded event names out of the forty-six the app
 * emits, and a "Enregistrer l'Endpoint" button with no `onClick` — nothing was
 * ever saved, and no route existed to save it to.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || fallback;

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface Delivery {
  id: string;
  endpointId: string;
  event: string;
  status: 'pending' | 'success' | 'failed' | 'exhausted';
  attempts: number;
  lastResponseCode: number | null;
  nextRetryAt: string | null;
  createdAt: string;
  endpointUrl: string;
}

const DELIVERY_STATUS: Record<string, { label: string; className: string }> = {
  success: { label: 'Livré', className: 'bg-accent/10 text-accent border-accent/20' },
  pending: { label: 'En cours', className: 'bg-primary/10 text-primary border-primary/20' },
  failed: { label: 'Échec, nouvelle tentative', className: 'bg-warning/10 text-warning border-warning/20/20' },
  exhausted: { label: 'Abandonné', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WebhookEndpoints() {
  const { data: endpointsData, isLoading, mutate } = useSWR<{ endpoints: Endpoint[] }>(
    '/api/v1/webhooks/endpoints',
    fetcher
  );
  const { data: deliveriesData, mutate: mutateDeliveries } = useSWR<{ deliveries: Delivery[] }>(
    '/api/v1/webhooks/deliveries?limit=20',
    fetcher
  );

  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['invoice.paid', 'quote.accepted']);

  const endpoints = endpointsData?.endpoints || [];
  const deliveries = deliveriesData?.deliveries || [];

  const toggleEvent = (name: string) => {
    setSelectedEvents((current) =>
      current.includes(name) ? current.filter((e) => e !== name) : [...current, name]
    );
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copié dans le presse-papier');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      toast.error('Renseignez l’URL de réception.');
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error('Sélectionnez au moins un événement.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/webhooks/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events: selectedEvents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Création refusée'));

      setRevealedSecret(data.secret);
      setIsCreating(false);
      setUrl('');
      toast.success('Endpoint enregistré');
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Création impossible');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (endpoint: Endpoint) => {
    setPendingId(endpoint.id);
    try {
      const res = await fetch(`/api/v1/webhooks/endpoints/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !endpoint.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Modification refusée'));

      toast.success(endpoint.active ? 'Endpoint désactivé' : 'Endpoint réactivé');
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Modification impossible');
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (endpoint: Endpoint) => {
    setPendingId(endpoint.id);
    try {
      const res = await fetch(`/api/v1/webhooks/endpoints/${endpoint.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readError(data, 'Suppression refusée'));

      toast.success('Endpoint supprimé');
      await Promise.all([mutate(), mutateDeliveries()]);
    } catch (err: any) {
      toast.error(err.message || 'Suppression impossible');
    } finally {
      setPendingId(null);
    }
  };

  const handleRotate = async (endpoint: Endpoint) => {
    setPendingId(endpoint.id);
    try {
      const res = await fetch(`/api/v1/webhooks/endpoints/${endpoint.id}/rotate-secret`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Rotation refusée'));

      setRevealedSecret(data.secret);
      toast.success('Nouveau secret généré');
    } catch (err: any) {
      toast.error(err.message || 'Rotation impossible');
    } finally {
      setPendingId(null);
    }
  };

  const handleTest = async (endpoint: Endpoint) => {
    setPendingId(endpoint.id);
    try {
      const res = await fetch(`/api/v1/webhooks/endpoints/${endpoint.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Envoi refusé'));

      if (data.status === 'success') {
        toast.success(`Votre endpoint a répondu ${data.responseCode}.`);
      } else {
        toast.error(
          data.responseCode
            ? `Votre endpoint a répondu ${data.responseCode}.`
            : `Aucune réponse : ${String(data.responseBody || '').slice(0, 120)}`
        );
      }
      await mutateDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Envoi impossible');
    } finally {
      setPendingId(null);
    }
  };

  const handleRedeliver = async (delivery: Delivery) => {
    setPendingId(delivery.id);
    try {
      const res = await fetch(`/api/v1/webhooks/deliveries/${delivery.id}/redeliver`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Renvoi refusé'));

      toast.success('Renvoi programmé');
      setTimeout(() => void mutateDeliveries(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Renvoi impossible');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" /> Endpoints webhook
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Les événements sont signés (<code className="font-mono">X-Webhook-Signature</code>) et
              réessayés six fois en cas d’échec.
            </CardDescription>
          </div>

          <Button
            onClick={() => setIsCreating(true)}
            className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-10 px-5"
          >
            <Plus className="mr-2 h-4 w-4" /> Nouvel endpoint
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : endpoints.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">
              Aucun endpoint. Ajoutez l’URL de votre automatisation pour recevoir les événements.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {endpoints.map((endpoint) => (
                <div key={endpoint.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-foreground break-all">
                          {endpoint.url}
                        </code>
                        <Badge
                          variant="outline"
                          className={
                            endpoint.active
                              ? 'bg-accent/10 text-accent border-accent/20 rounded-full text-[10px]'
                              : 'bg-muted text-muted-foreground border-border rounded-full text-[10px]'
                          }
                        >
                          {endpoint.active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Créé le {formatDateTime(endpoint.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === endpoint.id}
                        onClick={() => handleTest(endpoint)}
                        className="h-8 rounded-full text-[11px] text-primary hover:bg-primary/10"
                      >
                        {pendingId === endpoint.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Tester
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === endpoint.id}
                        onClick={() => handleRotate(endpoint)}
                        className="h-8 rounded-full text-[11px] text-muted-foreground hover:bg-muted"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Nouveau secret
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === endpoint.id}
                        onClick={() => handleToggleActive(endpoint)}
                        className="h-8 rounded-full text-[11px] text-muted-foreground hover:bg-muted"
                      >
                        {endpoint.active ? 'Désactiver' : 'Réactiver'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === endpoint.id}
                        onClick={() => handleDelete(endpoint)}
                        className="h-8 rounded-full text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {endpoint.events.includes(WEBHOOK_EVENT_WILDCARD) ? (
                      <Badge variant="outline" className="rounded-full text-[10px] border-border text-muted-foreground">
                        Tous les événements
                      </Badge>
                    ) : (
                      endpoint.events.map((event) => (
                        <Badge
                          key={event}
                          variant="outline"
                          className="rounded-full text-[10px] border-border text-muted-foreground font-mono"
                          title={WEBHOOK_EVENT_LABELS[event] || event}
                        >
                          {event}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border">
          <CardTitle className="text-sm font-medium text-foreground">Dernières livraisons</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Une livraison abandonnée après six tentatives peut être renvoyée à la main.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {deliveries.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">
              Aucune livraison pour l’instant.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Événement</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Tentatives</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Réponse</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Statut</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => {
                  const status = DELIVERY_STATUS[delivery.status] ?? {
                    label: delivery.status,
                    className: 'bg-muted text-muted-foreground border-border',
                  };
                  return (
                    <TableRow key={delivery.id} className="border-border">
                      <TableCell className="text-xs font-mono text-foreground">{delivery.event}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(delivery.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{delivery.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {delivery.lastResponseCode ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${status.className} rounded-full text-[10px] font-medium`}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {delivery.status !== 'success' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pendingId === delivery.id}
                            onClick={() => handleRedeliver(delivery)}
                            className="h-8 rounded-full text-[11px] text-primary hover:bg-primary/10"
                          >
                            {pendingId === delivery.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Renvoyer
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-[560px] rounded-xl max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle className="text-lg font-normal text-foreground">
                Nouvel endpoint webhook
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                L’URL doit être publique et en HTTPS. Le secret de signature ne s’affiche qu’une
                fois.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-xs font-medium text-foreground">URL de réception *</Label>
                <Input
                  type="url"
                  placeholder="https://n8n.mon-domaine.com/webhook/contravo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="rounded-xl text-xs font-mono"
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">
                    Événements écoutés ({selectedEvents.length})
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEvents([WEBHOOK_EVENT_WILDCARD])}
                    className="h-7 rounded-full text-[11px] text-primary hover:bg-primary/10"
                  >
                    Tout écouter
                  </Button>
                </div>

                {selectedEvents.includes(WEBHOOK_EVENT_WILDCARD) ? (
                  <div className="rounded-xl border border-border p-4 space-y-2">
                    <p className="text-xs text-foreground">
                      Cet endpoint recevra <span className="font-medium">tous</span> les événements,
                      y compris ceux ajoutés plus tard.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedEvents([])}
                      className="h-8 rounded-full text-[11px] border-border"
                    >
                      Choisir précisément
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto">
                    {WEBHOOK_EVENT_GROUPS.map((group) => (
                      <div key={group.label} className="p-3">
                        <p className="text-[11px] font-semibold text-foreground mb-2">
                          {group.label}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {group.events.map((event) => (
                            <label
                              key={event.name}
                              className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedEvents.includes(event.name)}
                                onCheckedChange={() => toggleEvent(event.name)}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-mono text-[10px] text-foreground">
                                  {event.name}
                                </span>
                                <br />
                                {event.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer l’endpoint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revealedSecret)} onOpenChange={() => setRevealedSecret(null)}>
        <DialogContent className="sm:max-w-[480px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal text-foreground">
              Secret de signature
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Copiez-le maintenant : il ne sera plus affiché. Il sert à vérifier l’en-tête
              <code className="font-mono"> X-Webhook-Signature</code> de chaque appel reçu.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-3">
            <code className="flex-1 break-all text-[11px] font-mono text-foreground">
              {revealedSecret}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copier le secret de signature"
              onClick={() => revealedSecret && copy(revealedSecret)}
              className="h-8 w-8 shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setRevealedSecret(null)}
              className="w-full rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11"
            >
              J’ai copié le secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

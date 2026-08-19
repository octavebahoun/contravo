'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Check,
  Copy,
  CreditCard,
  Loader2,
  ShieldCheck,
  Unplug,
  BellRing,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Encaissement — the organization's own collection settings.
 *
 * Two things the product could not do until now. Connecting a GeniusPay account:
 * the whole checkout flow was built, but nothing could ever write a row into
 * `payment_gateway_credentials`, so the portal's "Payer en ligne" button never
 * appeared for a real organization. And owning the dunning: the J+0/J+7/J+14/J+30
 * ladder fired on its own, and a provider could neither trigger a reminder nor
 * hold one back.
 */

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const readError = (data: any, fallback: string) =>
  data?.error?.message ||
  data?.message ||
  (typeof data?.error === 'string' ? data.error : null) ||
  fallback;

type GatewayStatus = {
  connected: boolean;
  environment: 'sandbox' | 'live' | null;
  apiKeyPublicMasked: string | null;
  merchantId: string | null;
  businessName: string | null;
  lastVerifiedAt: string | null;
  webhookUrl: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="tabular-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-border"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('Copié dans le presse-papier !');
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function PaymentsSettingsPage() {
  const { data: userData } = useSWR('/api/user', fetcher);
  const { data: team, mutate: mutateTeam } = useSWR('/api/team', fetcher);

  const slug = team?.slug;
  const {
    data: gateway,
    isLoading: isGatewayLoading,
    mutate: mutateGateway,
  } = useSWR<GatewayStatus>(slug ? `/api/v1/organizations/${slug}/payment-gateway` : null, fetcher);

  const [form, setForm] = useState({ apiKeyPublic: '', apiSecret: '', webhookSecret: '' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSavingReminders, setIsSavingReminders] = useState(false);

  const currentMember = team?.teamMembers?.find((m: any) => m.user?.id === userData?.id);
  const isAuthorized = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    try {
      const res = await fetch(`/api/v1/organizations/${slug}/payment-gateway`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'GeniusPay a refusé ces identifiants.'));

      toast.success(
        data.environment === 'live'
          ? 'Compte GeniusPay connecté — les paiements sont réels.'
          : 'Compte GeniusPay connecté en bac à sable.'
      );
      setForm({ apiKeyPublic: '', apiSecret: '', webhookSecret: '' });
      await mutateGateway();
    } catch (err: any) {
      toast.error(err.message || 'Connexion impossible');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch(`/api/v1/organizations/${slug}/payment-gateway`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Déconnexion impossible'));

      toast.success('Paiement en ligne désactivé. Vos clients règlent par virement.');
      await mutateGateway();
    } catch (err: any) {
      toast.error(err.message || 'Déconnexion impossible');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleToggleAutoReminders = async (enabled: boolean) => {
    setIsSavingReminders(true);
    try {
      const res = await fetch(`/api/v1/organizations/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRemindersEnabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Modification impossible'));

      toast.success(
        enabled
          ? 'Relances automatiques activées (J+0, J+7, J+14, J+30).'
          : 'Relances automatiques désactivées : vous relancez quand vous le décidez.'
      );
      await mutateTeam();
    } catch (err: any) {
      toast.error(err.message || 'Modification impossible');
    } finally {
      setIsSavingReminders(false);
    }
  };

  if (!userData || !team) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">Accès restreint</h2>
          <p className="text-sm text-muted-foreground">
            Les identifiants d’encaissement permettent de recevoir de l’argent au nom de
            l’organisation : seuls les propriétaires et administrateurs y accèdent.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-4xl mx-auto space-y-8">
      <div className="space-y-1 border-b border-border pb-6">
        <h1 className="text-2xl lg:text-3xl font-normal text-foreground tracking-tight">
          Encaissement
        </h1>
        <p className="text-sm text-muted-foreground">
          Comment vos clients vous paient, et comment vous les relancez.
        </p>
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" /> Paiement en ligne — GeniusPay
              </CardTitle>
              <CardDescription className="text-xs">
                Tant qu’aucun compte n’est connecté, le portail client n’affiche que vos
                coordonnées bancaires : le bouton « Payer » n’existe pas.
              </CardDescription>
            </div>
            {gateway?.connected ? (
              <Badge
                className={
                  gateway.environment === 'live'
                    ? 'bg-success/10 text-success border-success/30'
                    : 'bg-warning/10 text-warning border-warning/30'
                }
              >
                {gateway.environment === 'live' ? 'Réel' : 'Bac à sable'}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border text-muted-foreground">
                Non connecté
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-5">
          {isGatewayLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : gateway?.connected ? (
            <>
              <div className="rounded-lg border border-border p-4 space-y-2 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Marchand</span>
                  <span className="text-foreground">
                    {gateway.businessName || '—'}
                    {gateway.merchantId ? ` (#${gateway.merchantId})` : ''}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Clé publique</span>
                  <span className="tabular-mono text-foreground">
                    {gateway.apiKeyPublicMasked}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Vérifiée le</span>
                  <span className="text-foreground">
                    {gateway.lastVerifiedAt
                      ? new Date(gateway.lastVerifiedAt).toLocaleString('fr-FR')
                      : '—'}
                  </span>
                </div>
              </div>

              {gateway.environment === 'sandbox' ? (
                <p className="text-xs text-warning">
                  Ces clés sont celles du bac à sable : aucun paiement de vos clients n’est
                  réellement encaissé. Remplacez-les par vos clés « live » pour passer en réel.
                </p>
              ) : null}

              <CopyField label="URL webhook à déclarer sur GeniusPay" value={gateway.webhookUrl} />

              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="rounded-lg text-xs font-semibold h-11 px-5 border-border text-destructive hover:bg-destructive/10"
              >
                {isDisconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Désactiver le paiement en ligne
              </Button>
            </>
          ) : null}

          <form onSubmit={handleConnect} className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              {gateway?.connected
                ? 'Pour changer de compte ou passer en réel, collez la nouvelle paire de clés.'
                : 'Copiez ces trois valeurs depuis votre tableau de bord GeniusPay, onglet « Mes clés API ». Elles sont vérifiées auprès de GeniusPay avant d’être enregistrées, et le secret n’est jamais réaffiché.'}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="apiKeyPublic" className="text-xs">
                Clé publique (X-API-Key)
              </Label>
              <Input
                id="apiKeyPublic"
                value={form.apiKeyPublic}
                onChange={(e) => setForm({ ...form, apiKeyPublic: e.target.value })}
                placeholder="sk_sandbox_… ou pk_live_…"
                className="tabular-mono text-xs"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apiSecret" className="text-xs">
                Clé secrète (X-API-Secret)
              </Label>
              <Input
                id="apiSecret"
                type="password"
                value={form.apiSecret}
                onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                placeholder="ss_sandbox_… ou sk_live_…"
                className="tabular-mono text-xs"
                autoComplete="off"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="webhookSecret" className="text-xs">
                Secret webhook
              </Label>
              <Input
                id="webhookSecret"
                type="password"
                value={form.webhookSecret}
                onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                placeholder="Section « Webhooks » de GeniusPay"
                className="tabular-mono text-xs"
                autoComplete="off"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                C’est lui qui signe les confirmations de paiement. Sans le bon secret, un
                paiement réussi ne solderait jamais la facture.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isConnecting}
              className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-11 px-5"
            >
              {isConnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              {gateway?.connected ? 'Remplacer les clés' : 'Connecter mon compte GeniusPay'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" /> Relances des factures impayées
          </CardTitle>
          <CardDescription className="text-xs">
            Par défaut, rien ne part tout seul : le bouton « Relancer » sur chaque facture en
            retard vous laisse choisir le moment et le destinataire.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-5 pt-0">
          <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer">
            <Checkbox
              checked={Boolean(team?.autoRemindersEnabled)}
              disabled={isSavingReminders}
              onCheckedChange={(checked) => handleToggleAutoReminders(checked === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-xs font-medium text-foreground">
                Relancer automatiquement
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Un email part alors seul le jour de l’échéance, puis à J+7, J+14 et J+30, tant
                que la facture n’est pas soldée. Vous gardez la main : le bouton « Relancer »
                reste disponible.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
    </section>
  );
}

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, ShieldAlert, ArrowUpRight, Zap, Building2, User } from 'lucide-react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface UsageData {
  planId: string;
  status: string;
  quotas: {
    maxMembers: number | null;
    maxClients: number | null;
    maxProjects: number | null;
    maxStorageBytes: number;
    maxApiCallsPerMonth: number;
  };
  usage: {
    membersCount: number;
    clientsCount: number;
    projectsCount: number;
    storageBytesUsed: number;
    apiCallsCount: number;
  };
}

export default function BillingPage() {
  const { data: usageData, error, isLoading, mutate } = useSWR<UsageData>('/api/v1/billing', fetcher);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    try {
      setUpgradingPlan(planId);
      const res = await fetch('/api/v1/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlanId: planId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Erreur lors de l’initialisation du paiement');
      }

      if (data.checkoutUrl) {
        toast.success('Redirection vers le paiement GeniusPay...');
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      toast.error(err.message || 'Impossible de lancer le paiement');
    } finally {
      setUpgradingPlan(null);
    }
  };

  const currentPlan = usageData?.planId || 'free';
  const status = usageData?.status || 'active';

  const formatStorage = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* En-tête de page style Coinbase */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-normal text-[#0a0b0d] tracking-tight font-sans">
            Abonnement & Quotas
          </h1>
          <p className="text-[#5b616e] text-sm mt-1">
            Gérez le forfait de votre organisation et suivez l'utilisation de vos limites SaaS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-[#7c828a] font-semibold">Statut :</span>
          <Badge
            variant={status === 'active' ? 'default' : 'destructive'}
            className={
              status === 'active'
                ? 'bg-[#05b169]/10 text-[#05b169] border-[#05b169]/20 rounded-full px-3 py-1 text-xs font-medium shadow-none'
                : 'bg-[#cf202f]/10 text-[#cf202f] border-[#cf202f]/20 rounded-full px-3 py-1 text-xs font-medium shadow-none'
            }
          >
            {status === 'active' ? 'Actif' : status === 'past_due' ? 'Paiement en retard' : status}
          </Badge>
        </div>
      </div>

      {/* Alerte Dunning en cas d'échec de paiement */}
      {status === 'past_due' && (
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-[#cf202f]/5 border border-[#cf202f]/20 text-[#cf202f]">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Votre dernier paiement a échoué.</p>
            <p className="mt-1 text-xs opacity-90">
              Veuillez régulariser votre abonnement pour éviter la suspension des fonctionnalités Pro.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="plans" className="w-full space-y-6">
        <TabsList className="bg-[#f7f7f7] p-1 rounded-full border border-gray-200/80">
          <TabsTrigger value="plans" className="rounded-full text-xs font-medium px-5 data-[state=active]:bg-white data-[state=active]:text-[#0a0b0d] data-[state=active]:shadow-sm">
            Forfaits & Tarifs
          </TabsTrigger>
          <TabsTrigger value="quotas" className="rounded-full text-xs font-medium px-5 data-[state=active]:bg-white data-[state=active]:text-[#0a0b0d] data-[state=active]:shadow-sm">
            Utilisation des Quotas
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Tarifs SaaS */}
        <TabsContent value="plans" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card Free */}
            <Card className={`rounded-2xl border transition-all duration-200 ${currentPlan === 'free' ? 'border-[#0052ff] shadow-sm bg-white' : 'border-gray-200 bg-white'}`}>
              <CardHeader className="p-6">
                <div className="flex items-center justify-between">
                  <span className="p-2 rounded-xl bg-gray-100 text-gray-700">
                    <User className="h-5 w-5" />
                  </span>
                  {currentPlan === 'free' && (
                    <Badge variant="outline" className="border-[#0052ff] text-[#0052ff] rounded-full text-xs">
                      Plan Actuel
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-xl font-normal text-[#0a0b0d] mt-4">Free</CardTitle>
                <CardDescription className="text-xs text-[#5b616e]">
                  Pour indépendants démarrant sur Contravo.
                </CardDescription>
                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-medium tracking-tight text-[#0a0b0d]">0 XOF</span>
                  <span className="text-xs text-[#7c828a] ml-1">/ mois</span>
                </div>
              </CardHeader>

              <CardContent className="p-6 pt-0 space-y-4">
                <div className="border-t border-gray-100 pt-4 space-y-2 text-xs text-[#5b616e]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>Jusqu'à 3 membres d'équipe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>10 clients & 5 projets</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>500 MB de stockage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>1 Clé API & 1 Webhook</span>
                  </div>
                </div>

                <Button
                  disabled={currentPlan === 'free'}
                  variant="outline"
                  className="w-full rounded-full border-gray-300 text-[#0a0b0d] hover:bg-gray-50 text-xs font-semibold h-11 mt-4"
                >
                  {currentPlan === 'free' ? 'Plan Actif' : 'Gratuit'}
                </Button>
              </CardContent>
            </Card>

            {/* Card Pro (En avant Coinbase Dark style) */}
            <Card className={`rounded-2xl border transition-all duration-200 relative ${currentPlan === 'pro' ? 'border-[#0052ff] ring-2 ring-[#0052ff]' : 'border-[#0a0b0d] bg-[#0a0b0d] text-white'}`}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0052ff] text-white text-[10px] font-semibold tracking-wider uppercase px-3 py-0.5 rounded-full">
                Populaire
              </div>
              <CardHeader className="p-6">
                <div className="flex items-center justify-between">
                  <span className="p-2 rounded-xl bg-white/10 text-[#0052ff]">
                    <Zap className="h-5 w-5 text-[#0052ff]" />
                  </span>
                  {currentPlan === 'pro' && (
                    <Badge className="bg-[#0052ff] text-white rounded-full text-xs">
                      Plan Actuel
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-xl font-normal text-white mt-4">Pro</CardTitle>
                <CardDescription className="text-xs text-[#a8acb3]">
                  Pour agences et équipes professionnelles.
                </CardDescription>
                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-medium tracking-tight text-white">15 000 XOF</span>
                  <span className="text-xs text-[#a8acb3] ml-1">/ mois</span>
                </div>
              </CardHeader>

              <CardContent className="p-6 pt-0 space-y-4">
                <div className="border-t border-white/10 pt-4 space-y-2 text-xs text-[#a8acb3]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#0052ff]" />
                    <span className="text-white">Jusqu'à 15 membres d'équipe</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#0052ff]" />
                    <span className="text-white">200 clients & 100 projets</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#0052ff]" />
                    <span className="text-white">10 GB de stockage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#0052ff]" />
                    <span className="text-white">10 Clés API & Webhooks</span>
                  </div>
                </div>

                <Button
                  disabled={currentPlan === 'pro' || upgradingPlan === 'pro'}
                  onClick={() => handleSubscribe('pro')}
                  className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11 mt-4 shadow-sm"
                >
                  {upgradingPlan === 'pro' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Chargement...
                    </>
                  ) : currentPlan === 'pro' ? (
                    'Plan Actif'
                  ) : (
                    <>
                      Passer à Pro <ArrowUpRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Card Business */}
            <Card className={`rounded-2xl border transition-all duration-200 ${currentPlan === 'business' ? 'border-[#0052ff] shadow-sm bg-white' : 'border-gray-200 bg-white'}`}>
              <CardHeader className="p-6">
                <div className="flex items-center justify-between">
                  <span className="p-2 rounded-xl bg-gray-100 text-gray-700">
                    <Building2 className="h-5 w-5" />
                  </span>
                  {currentPlan === 'business' && (
                    <Badge variant="outline" className="border-[#0052ff] text-[#0052ff] rounded-full text-xs">
                      Plan Actuel
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-xl font-normal text-[#0a0b0d] mt-4">Business</CardTitle>
                <CardDescription className="text-xs text-[#5b616e]">
                  Pour grandes entreprises à fort volume.
                </CardDescription>
                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-medium tracking-tight text-[#0a0b0d]">50 000 XOF</span>
                  <span className="text-xs text-[#7c828a] ml-1">/ mois</span>
                </div>
              </CardHeader>

              <CardContent className="p-6 pt-0 space-y-4">
                <div className="border-t border-gray-100 pt-4 space-y-2 text-xs text-[#5b616e]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>Membres & Clients <strong>Illimités</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>Projets <strong>Illimités</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>100 GB de stockage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#05b169]" />
                    <span>Support prioritaire 24/7</span>
                  </div>
                </div>

                <Button
                  disabled={currentPlan === 'business' || upgradingPlan === 'business'}
                  onClick={() => handleSubscribe('business')}
                  variant="outline"
                  className="w-full rounded-full border-gray-300 text-[#0a0b0d] hover:bg-gray-50 text-xs font-semibold h-11 mt-4"
                >
                  {upgradingPlan === 'business' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Chargement...
                    </>
                  ) : currentPlan === 'business' ? (
                    'Plan Actif'
                  ) : (
                    <>
                      Passer à Business <ArrowUpRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Quotas de l'organisation */}
        <TabsContent value="quotas" className="space-y-6">
          <Card className="rounded-2xl border border-gray-200 bg-white">
            <CardHeader className="p-6 border-b border-gray-100">
              <CardTitle className="text-lg font-normal text-[#0a0b0d]">Jauges d'utilisation du Forfait</CardTitle>
              <CardDescription className="text-xs text-[#5b616e]">
                Aperçu en temps réel de votre consommation par rapport aux plafonds autorisés.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Quota 1: Membres */}
                  <div className="space-y-2 p-4 rounded-xl bg-[#f7f7f7] border border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#0a0b0d]">Membres d'équipe</span>
                      <span className="text-[#5b616e]">
                        {usageData?.usage?.membersCount ?? 1} / {usageData?.quotas?.maxMembers ? usageData.quotas.maxMembers : 'Illimité'}
                      </span>
                    </div>
                    <Progress
                      value={
                        usageData?.quotas?.maxMembers
                          ? Math.min(100, ((usageData?.usage?.membersCount || 1) / usageData.quotas.maxMembers) * 100)
                          : 15
                      }
                      className="h-2 bg-gray-200"
                    />
                  </div>

                  {/* Quota 2: Clients */}
                  <div className="space-y-2 p-4 rounded-xl bg-[#f7f7f7] border border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#0a0b0d]">Fiches Clients</span>
                      <span className="text-[#5b616e]">
                        {usageData?.usage?.clientsCount ?? 0} / {usageData?.quotas?.maxClients ? usageData.quotas.maxClients : 'Illimité'}
                      </span>
                    </div>
                    <Progress
                      value={
                        usageData?.quotas?.maxClients
                          ? Math.min(100, ((usageData?.usage?.clientsCount || 0) / usageData.quotas.maxClients) * 100)
                          : 5
                      }
                      className="h-2 bg-gray-200"
                    />
                  </div>

                  {/* Quota 3: Stockage */}
                  <div className="space-y-2 p-4 rounded-xl bg-[#f7f7f7] border border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#0a0b0d]">Stockage de Fichiers</span>
                      <span className="text-[#5b616e]">
                        {formatStorage(usageData?.usage?.storageBytesUsed || 0)} / {formatStorage(usageData?.quotas?.maxStorageBytes || 524288000)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        ((usageData?.usage?.storageBytesUsed || 0) / (usageData?.quotas?.maxStorageBytes || 524288000)) * 100
                      )}
                      className="h-2 bg-gray-200"
                    />
                  </div>

                  {/* Quota 4: Appels API */}
                  <div className="space-y-2 p-4 rounded-xl bg-[#f7f7f7] border border-gray-100">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[#0a0b0d]">Appels API ce mois</span>
                      <span className="text-[#5b616e]">
                        {usageData?.usage?.apiCallsCount ?? 0} / {usageData?.quotas?.maxApiCallsPerMonth?.toLocaleString() || 1000}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        ((usageData?.usage?.apiCallsCount || 0) / (usageData?.quotas?.maxApiCallsPerMonth || 1000)) * 100
                      )}
                      className="h-2 bg-gray-200"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

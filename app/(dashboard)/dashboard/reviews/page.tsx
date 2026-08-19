'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Star, Check, X, MessageSquareQuote, Send, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetcher,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
  type StatusTone,
} from '../_components/module-ui';

interface Review {
  id: string;
  projectId: string;
  clientId: string;
  rating: number;
  comment: string | null;
  submittedAt: string;
  submittedByName: string;
  submittedByEmail: string;
  isPublic: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
}

interface Project {
  id: string;
  name: string;
  clientId: string;
  status: string;
}

interface Client {
  id: string;
  displayName: string;
  email: string;
}

interface ReviewRequest {
  id: string;
  projectId: string;
  clientId: string;
  status: 'pending' | 'submitted' | 'expired';
  sentAt: string | null;
  expiresAt: string;
}

const MODERATION_LABELS: Record<Review['moderationStatus'], { label: string; tone: StatusTone }> = {
  pending: { label: 'À modérer', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={
            value <= rating
              ? 'h-3.5 w-3.5 fill-warning text-warning'
              : 'h-3.5 w-3.5 text-border'
          }
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [search, setSearch] = useState('');
  const [moderationFilter, setModerationFilter] = useState('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<{ reviews: Review[] }>(
    `/api/v1/reviews${moderationFilter !== 'all' ? `?moderationStatus=${moderationFilter}` : ''}`,
    fetcher
  );
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);
  const { data: clientsData } = useSWR<{ clients: Client[] }>('/api/v1/clients', fetcher);
  const { data: requestsData, mutate: mutateRequests } = useSWR<{ requests: ReviewRequest[] }>(
    '/api/v1/reviews/requests',
    fetcher
  );

  const reviews = data?.reviews || [];
  const projects = projectsData?.projects || [];
  const clients = clientsData?.clients || [];
  const requests = requestsData?.requests || [];

  const filteredReviews = reviews.filter((review) => {
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      review.submittedByName.toLowerCase().includes(needle) ||
      (review.comment || '').toLowerCase().includes(needle)
    );
  });

  const averageRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const pendingCount = reviews.filter((r) => r.moderationStatus === 'pending').length;

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || 'Projet inconnu';

  const getClient = (clientId: string) => clients.find((c) => c.id === clientId);

  /**
   * Envoie la demande d'avis pour un projet.
   *
   * Le client destinataire n'est pas à choisir : un projet appartient déjà à
   * un client, et laisser sélectionner les deux séparément n'aurait fait
   * qu'ouvrir la porte à un avis demandé à la mauvaise personne.
   */
  const handleRequestReview = async (project: Project) => {
    setRequestingId(project.id);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}/review-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: project.clientId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(
          payload?.error?.message || payload?.message || 'Demande d’avis refusée'
        );
      }

      const client = getClient(project.clientId);
      toast.success(
        client?.email
          ? `Demande envoyée à ${client.email}`
          : 'Demande d’avis envoyée'
      );
      mutateRequests();
    } catch (err: any) {
      toast.error(err.message || 'Demande d’avis impossible');
    } finally {
      setRequestingId(null);
    }
  };

  const handleModerate = async (id: string, moderationStatus: 'approved' | 'rejected') => {
    try {
      setPendingId(id);
      const res = await fetch(`/api/v1/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderationStatus }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || errData.message || 'Modération refusée');
      }

      toast.success(moderationStatus === 'approved' ? 'Avis approuvé' : 'Avis rejeté');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la modération');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Avis clients"
        description="Modérez les avis collectés à la fin de vos projets avant de les rendre publics."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <MetricCard
          label="Note moyenne"
          value={reviews.length ? `${averageRating.toFixed(1)} / 5` : '—'}
          hint="Sur l’ensemble des avis reçus"
          icon={<Star className="h-4 w-4 fill-warning text-warning" />}
        />
        <MetricCard
          label="En attente de modération"
          value={pendingCount}
          hint="Non encore publiés"
          icon={<MessageSquareQuote className="h-4 w-4 text-primary" />}
        />
        <MetricCard
          label="Total avis"
          value={reviews.length}
          hint="Reçus via le portail client"
          icon={<MessageSquareQuote className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium text-foreground">Demander un avis</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Un email part au client du projet avec son lien personnel. Rien ne quitte cet écran
            sans que vous cliquiez.
          </p>
        </CardHeader>

        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Aucun projet. Créez-en un pour pouvoir demander un avis à son client.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Client</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Demande</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const client = getClient(project.clientId);
                  const request = requests.find((r) => r.projectId === project.id);
                  const hasReview = reviews.some((r) => r.projectId === project.id);
                  const isSending = requestingId === project.id;

                  return (
                    <TableRow key={project.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-xs text-foreground">
                        <div className="font-medium">{project.name}</div>
                        <div className="text-[11px] text-muted-foreground font-normal">
                          {project.status}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {client ? (
                          <>
                            <div className="text-foreground">{client.displayName}</div>
                            <div className="text-[11px]">{client.email}</div>
                          </>
                        ) : (
                          'Client inconnu'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {hasReview ? (
                          <StatusBadge tone="success">Avis reçu</StatusBadge>
                        ) : request?.status === 'pending' ? (
                          <span>
                            Envoyée le {formatDate(request.sentAt || request.expiresAt)}
                          </span>
                        ) : request?.status === 'expired' ? (
                          <StatusBadge tone="danger">Expirée</StatusBadge>
                        ) : (
                          <span className="text-[11px]">Jamais demandée</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasReview ? (
                          // Pas de bouton : redemander effacerait l'avis reçu.
                          // Le dépôt refuse de toute façon, autant ne pas
                          // proposer le geste.
                          <span className="text-[11px] text-muted-foreground">Terminé</span>
                        ) : (
                          <Button
                            variant={request ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isSending || !client}
                            onClick={() => handleRequestReview(project)}
                            className="h-8 rounded-full text-[11px] border-border"
                          >
                            {isSending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                            {request ? 'Renvoyer le lien' : 'Demander un avis'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border bg-card">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un auteur ou un commentaire..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border text-xs"
            />
          </div>

          <Select value={moderationFilter} onValueChange={setModerationFilter}>
            <SelectTrigger className="w-[200px] rounded-xl text-xs">
              <SelectValue placeholder="Tous les avis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les avis</SelectItem>
              <SelectItem value="pending">À modérer</SelectItem>
              <SelectItem value="approved">Approuvés</SelectItem>
              <SelectItem value="rejected">Rejetés</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Aucun avis pour le moment. Ils arrivent lorsqu’un client répond à une demande d’avis.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold text-foreground">Auteur</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Note</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Reçu le</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground">Modération</TableHead>
                  <TableHead className="text-xs font-semibold text-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.map((review) => {
                  const moderation = MODERATION_LABELS[review.moderationStatus] || MODERATION_LABELS.pending;
                  const isPending = pendingId === review.id;

                  return (
                    <TableRow key={review.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-xs text-foreground">
                        <div className="font-medium">{review.submittedByName}</div>
                        <div className="text-[11px] text-muted-foreground font-normal">{review.submittedByEmail}</div>
                        {review.comment && (
                          <p className="text-[11px] text-muted-foreground font-normal mt-1 max-w-md">
                            « {review.comment} »
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getProjectName(review.projectId)}</TableCell>
                      <TableCell>
                        <Stars rating={review.rating} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(review.submittedAt)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={moderation.tone}>{moderation.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {review.moderationStatus !== 'approved' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleModerate(review.id, 'approved')}
                              className="h-8 rounded-full text-[11px] text-accent hover:bg-accent/10"
                            >
                              {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Approuver
                            </Button>
                          )}

                          {review.moderationStatus !== 'rejected' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleModerate(review.id, 'rejected')}
                              className="h-8 rounded-full text-[11px] text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                              Rejeter
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

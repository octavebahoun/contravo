'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Star, Check, X, MessageSquareQuote } from 'lucide-react';
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
              ? 'h-3.5 w-3.5 fill-[#f4b000] text-[#f4b000]'
              : 'h-3.5 w-3.5 text-[#dee1e6]'
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

  const { data, isLoading, mutate } = useSWR<{ reviews: Review[] }>(
    `/api/v1/reviews${moderationFilter !== 'all' ? `?moderationStatus=${moderationFilter}` : ''}`,
    fetcher
  );
  const { data: projectsData } = useSWR<{ projects: Project[] }>('/api/v1/projects', fetcher);

  const reviews = data?.reviews || [];
  const projects = projectsData?.projects || [];

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
          icon={<Star className="h-4 w-4 fill-[#f4b000] text-[#f4b000]" />}
        />
        <MetricCard
          label="En attente de modération"
          value={pendingCount}
          hint="Non encore publiés"
          icon={<MessageSquareQuote className="h-4 w-4 text-[#0052ff]" />}
        />
        <MetricCard
          label="Total avis"
          value={reviews.length}
          hint="Reçus via le portail client"
          icon={<MessageSquareQuote className="h-4 w-4 text-[#7c828a]" />}
        />
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardHeader className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
            <Input
              placeholder="Rechercher un auteur ou un commentaire..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-gray-200 text-xs"
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
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="text-center py-12 text-[#7c828a] text-xs">
              Aucun avis pour le moment. Ils arrivent lorsqu’un client répond à une demande d’avis.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Auteur</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Projet</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Note</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Reçu le</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Modération</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.map((review) => {
                  const moderation = MODERATION_LABELS[review.moderationStatus] || MODERATION_LABELS.pending;
                  const isPending = pendingId === review.id;

                  return (
                    <TableRow key={review.id} className="border-gray-100 hover:bg-gray-50/50">
                      <TableCell className="text-xs text-[#0a0b0d]">
                        <div className="font-medium">{review.submittedByName}</div>
                        <div className="text-[11px] text-[#7c828a] font-normal">{review.submittedByEmail}</div>
                        {review.comment && (
                          <p className="text-[11px] text-[#5b616e] font-normal mt-1 max-w-md">
                            « {review.comment} »
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{getProjectName(review.projectId)}</TableCell>
                      <TableCell>
                        <Stars rating={review.rating} />
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">{formatDate(review.submittedAt)}</TableCell>
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
                              className="h-8 rounded-full text-[11px] text-[#05b169] hover:bg-[#05b169]/10"
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
                              className="h-8 rounded-full text-[11px] text-[#cf202f] hover:bg-[#cf202f]/10"
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

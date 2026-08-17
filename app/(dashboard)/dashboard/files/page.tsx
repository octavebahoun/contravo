'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Download,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetcher,
  formatDate,
  ModuleHeader,
  MetricCard,
  StatusBadge,
  type StatusTone,
} from '../_components/module-ui';

/**
 * Documents stored by the organization.
 *
 * The upload and download routes already existed but nothing listed the files,
 * so everything an organization stored in R2 was unreachable from the interface.
 * Uploads go straight to R2 through a presigned PUT — the file never transits
 * through the application server.
 */

interface StoredFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  kind: string;
  status: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  uploadedVia: string;
  createdAt: string;
  uploadedByName: string | null;
}

interface FilesResponse {
  files: StoredFile[];
  pagination: { page: number; limit: number; total: number };
  totalBytes: string;
}

const KIND_LABELS: Record<string, string> = {
  quote_pdf: 'Devis PDF',
  contract_pdf: 'Contrat PDF',
  contract_signed_pdf: 'Contrat signé',
  invoice_pdf: 'Facture PDF',
  deliverable: 'Livrable',
  expense_receipt: 'Justificatif',
  signature_canvas: 'Signature',
  attachment: 'Pièce jointe',
};

/** Only these can be uploaded by hand; the PDF kinds are generated server-side. */
const UPLOADABLE_KINDS = ['attachment', 'deliverable', 'expense_receipt'] as const;

const STATUS_TONES: Record<string, { label: string; tone: StatusTone }> = {
  ready: { label: 'Disponible', tone: 'success' },
  clean: { label: 'Disponible', tone: 'success' },
  uploading: { label: 'Envoi en cours', tone: 'info' },
  scanning: { label: 'Analyse antivirus', tone: 'info' },
  infected: { label: 'Infecté', tone: 'danger' },
  failed: { label: 'Échec', tone: 'danger' },
};

/** Binary units, matching how R2 and the quota are counted. */
function formatSize(bytes: string | number) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** exponent;
  return `${scaled.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-[#7c828a]" />;
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-[#cf202f]" />;
  return <Paperclip className="h-4 w-4 text-[#7c828a]" />;
}

export default function FilesPage() {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadKind, setUploadKind] = useState<string>('attachment');
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = new URLSearchParams({ limit: '100' });
  if (search) query.set('search', search);
  if (kindFilter !== 'all') query.set('kind', kindFilter);

  const { data, isLoading, mutate } = useSWR<FilesResponse>(
    `/api/v1/files?${query.toString()}`,
    fetcher
  );

  const files = data?.files || [];

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      // 1. Reserve the object and get a presigned PUT. The server validates the
      // MIME type, the size limit and the storage quota at this step.
      const presignRes = await fetch('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: uploadKind,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });

      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign?.error?.message || 'Envoi refusé');
      }

      // 2. Straight to R2, without passing through the application server.
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!putRes.ok) {
        throw new Error(`Le transfert vers le stockage a échoué (${putRes.status})`);
      }

      // 3. Only this call flips the row to `ready`: it re-reads the object,
      // checks the checksum and runs the antivirus scan.
      const completeRes = await fetch(`/api/v1/uploads/${presign.fileId}/complete`, {
        method: 'POST',
      });

      const completed = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completed?.error?.message || 'Vérification du fichier échouée');
      }

      toast.success(`${file.name} a été envoyé.`);
      setIsUploadOpen(false);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Impossible d’envoyer le fichier');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (file: StoredFile) => {
    setDownloadingId(file.id);
    try {
      const res = await fetch(`/api/v1/files/${file.id}/download`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error?.message || 'Téléchargement impossible');
      }
      // The presigned URL is short-lived, so it is opened rather than stored.
      window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err.message || 'Téléchargement impossible');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/files/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Suppression impossible');
      }
      toast.success('Fichier supprimé.');
      setPendingDelete(null);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Suppression impossible');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      <ModuleHeader
        title="Fichiers"
        description="Tous les documents de votre organisation : PDF générés, livrables et justificatifs."
        action={
          <Button
            onClick={() => setIsUploadOpen(true)}
            className="rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold px-5 h-11 shadow-sm"
          >
            <Upload className="mr-2 h-4 w-4" /> Envoyer un fichier
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <MetricCard
          label="Fichiers"
          value={data?.pagination?.total ?? 0}
          hint="Sur l’ensemble de l’organisation"
          icon={<Paperclip className="h-4 w-4 text-[#0052ff]" />}
        />
        <MetricCard
          label="Espace utilisé"
          value={formatSize(data?.totalBytes ?? 0)}
          hint="Décompté de votre quota de stockage"
          icon={<HardDrive className="h-4 w-4 text-[#7c828a]" />}
        />
        <MetricCard
          label="En cours de traitement"
          value={files.filter((f) => f.status === 'uploading' || f.status === 'scanning').length}
          hint="Envoi ou analyse antivirus"
          icon={<Loader2 className="h-4 w-4 text-[#f4b000]" />}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c828a]" />
          <Input
            placeholder="Rechercher par nom de fichier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-full h-11 text-xs"
          />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-full sm:w-56 rounded-full h-11 text-xs">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl border border-gray-200 bg-white">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#0052ff]" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-16 text-[#7c828a] text-xs">
              {search || kindFilter !== 'all'
                ? 'Aucun fichier ne correspond à cette recherche.'
                : 'Aucun fichier pour l’instant.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]/50">
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Nom</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Taille</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Ajouté par</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d]">Statut</TableHead>
                  <TableHead className="text-xs font-semibold text-[#0a0b0d] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => {
                  const badge = STATUS_TONES[file.status] || {
                    label: file.status,
                    tone: 'neutral' as StatusTone,
                  };
                  const isDownloadable = file.status === 'ready';
                  return (
                    <TableRow key={file.id} className="border-gray-100 hover:bg-gray-50/50">
                      <TableCell className="text-xs font-medium text-[#0a0b0d]">
                        <span className="flex items-center gap-2">
                          <FileIcon mimeType={file.mimeType} />
                          <span className="truncate max-w-[260px]">{file.filename}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {KIND_LABELS[file.kind] || file.kind}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {formatSize(file.sizeBytes)}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {file.uploadedByName || 'Généré automatiquement'}
                      </TableCell>
                      <TableCell className="text-xs text-[#5b616e]">
                        {formatDate(file.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isDownloadable || downloadingId === file.id}
                            onClick={() => handleDownload(file)}
                            className="h-8 rounded-full text-[11px] text-[#0052ff] hover:bg-[#0052ff]/10"
                          >
                            {downloadingId === file.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(file)}
                            className="h-8 rounded-full text-[11px] text-[#cf202f] hover:bg-[#cf202f]/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      <Dialog open={isUploadOpen} onOpenChange={(open) => !isUploading && setIsUploadOpen(open)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal text-[#0a0b0d]">
              Envoyer un fichier
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5b616e]">
              Le fichier est analysé par l’antivirus avant d’être disponible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#0a0b0d]">Type de document</label>
              <Select value={uploadKind} onValueChange={setUploadKind} disabled={isUploading}>
                <SelectTrigger className="rounded-xl h-11 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPLOADABLE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#7c828a]">
                Les PDF de devis, contrats et factures sont générés par Contravo, ils n’ont pas à
                être envoyés ici.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded-full bg-[#0052ff] hover:bg-[#003ecc] text-white text-xs font-semibold h-11"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi en cours…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Choisir un fichier
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-normal text-[#0a0b0d]">
              Supprimer ce fichier ?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5b616e] pt-2">
              {pendingDelete?.filename} sera définitivement effacé du stockage. Si ce document est
              rattaché à un devis, un contrat ou une facture, le lien sera rompu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
              className="rounded-full border-gray-300 text-xs font-semibold h-10"
            >
              Annuler
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-full bg-[#cf202f] hover:bg-[#b01b28] text-white text-xs font-semibold h-10"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

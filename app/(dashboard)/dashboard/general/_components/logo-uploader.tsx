'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageOff, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Organization logo upload.
 *
 * The logo is what appears at the top of every transactional email, so it is
 * served by the public `GET /api/v1/organizations/:id/logo` route rather than a
 * presigned link: a mail client opening the message days later must still be able
 * to resolve the image.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function LogoUploader() {
  const { data: team, mutate } = useSWR<{ id: string; name: string; logoFileId?: string | null }>(
    '/api/team',
    fetcher
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  // Bumped after each change so the browser re-fetches a URL it has cached.
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const orgId = team?.id;
  const hasLogo = Boolean(team?.logoFileId);
  const logoSrc = orgId ? `/api/v1/organizations/${orgId}/logo?v=${version}` : null;

  const handleFile = async (file: File) => {
    if (!orgId) return;

    if (file.size > MAX_BYTES) {
      toast.error('Le logo ne doit pas dépasser 2 Mo.');
      return;
    }

    setIsUploading(true);
    try {
      const presignRes = await fetch('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'attachment',
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign?.error?.message || 'Envoi refusé');
      }

      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Le transfert vers le stockage a échoué (${putRes.status})`);
      }

      const completeRes = await fetch(`/api/v1/uploads/${presign.fileId}/complete`, {
        method: 'POST',
      });
      const completed = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completed?.error?.message || 'Vérification du fichier échouée');
      }

      // Only now is the file `ready`, which is what the logo route requires.
      const setRes = await fetch(`/api/v1/organizations/${orgId}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: presign.fileId }),
      });
      const set = await setRes.json();
      if (!setRes.ok) {
        throw new Error(set?.error?.message || 'Impossible de définir le logo');
      }

      toast.success('Logo mis à jour. Il apparaîtra dans vos prochains emails.');
      setVersion((v) => v + 1);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Impossible d’envoyer le logo');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!orgId) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/logo`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Suppression impossible');
      }
      toast.success('Logo retiré.');
      setVersion((v) => v + 1);
      await mutate();
    } catch (err: any) {
      toast.error(err.message || 'Suppression impossible');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo de l’organisation</CardTitle>
        <CardDescription>
          Affiché en tête des emails envoyés à vos clients. PNG, JPEG, WebP ou GIF, 2 Mo maximum.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border bg-muted/40 overflow-hidden">
            {hasLogo && logoSrc ? (
              // Plain <img>: next/image would need the host allow-listed, and this
              // is a same-origin route serving arbitrary tenant uploads.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="Logo de l’organisation" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageOff className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading || !orgId}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi en cours…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" /> {hasLogo ? 'Remplacer' : 'Choisir un logo'}
                  </>
                )}
              </Button>

              {hasLogo && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={isRemoving || isUploading}
                >
                  {isRemoving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Retirer
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Le fichier est analysé par l’antivirus avant d’être publié.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

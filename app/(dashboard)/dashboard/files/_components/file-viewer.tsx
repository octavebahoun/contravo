'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Reads a stored document without leaving the site.
 *
 * Everything the interface offered was a download: a signed contract, a client's
 * signature or a delivered image had to be handed to another application before
 * anyone could look at it. The bytes still never transit this server — the viewer
 * points at the same short-lived R2 URL the download uses, asked for with
 * `disposition=inline` so the browser renders it instead of saving it.
 */

/** What the browser can render in place; anything else is download-only. */
const VIEWABLE = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function isViewable(mimeType: string): boolean {
  return VIEWABLE.has(mimeType.toLowerCase());
}

export type ViewerFile = {
  id: string;
  filename: string;
  mimeType: string;
};

export function FileViewer({
  file,
  onClose,
  onDownload,
}: {
  file: ViewerFile | null;
  onClose: () => void;
  onDownload: (file: ViewerFile) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setError(null);
      return;
    }

    // Guards against a slow request for a file the user has already closed
    // overwriting the one they opened next.
    let cancelled = false;

    setUrl(null);
    setError(null);

    // An hour, because the viewer stays open while someone actually reads the
    // document — the five-minute default of a download link would expire under a
    // long contract and leave a blank frame.
    fetch(`/api/v1/files/${file.id}/download?disposition=inline&expiresIn=3600`)
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            payload?.error?.message || payload?.message || 'Aperçu indisponible'
          );
        }
        if (!cancelled) setUrl(payload.downloadUrl);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Aperçu indisponible');
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const isImage = file?.mimeType.toLowerCase().startsWith('image/');

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-xl max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-medium text-foreground truncate pr-8">
            {file?.filename}
          </DialogTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!url}
              onClick={() => file && onDownload(file)}
              className="h-8 rounded-full text-[11px] border-border"
            >
              <Download className="h-3.5 w-3.5" /> Télécharger
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!url}
              onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
              className="h-8 rounded-full text-[11px]"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ouvrir dans un onglet
            </Button>
          </div>
        </DialogHeader>

        <div className="bg-muted/40 h-[70vh] flex items-center justify-center overflow-auto">
          {error ? (
            <p className="text-xs text-destructive px-6 text-center">{error}</p>
          ) : !url ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file?.filename ?? ''}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              src={url}
              title={file?.filename ?? 'Document'}
              className="h-full w-full border-0 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

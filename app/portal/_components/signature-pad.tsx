'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Handwritten signature capture (MVP4 §7.1 step 4).
 *
 * Draws with pointer events so mouse, stylus and touch all work from one code
 * path, and exports a PNG data URI — the format the signing pipeline expects
 * before it stores the canvas and stamps it onto the signed PDF.
 */
export function SignaturePad({
  onChange,
  disabled = false,
}: {
  /** Receives the PNG data URI, or null once cleared. */
  onChange: (dataUri: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // Size the backing store to the device pixel ratio, otherwise the stroke
  // looks blurry on the phones most recipients sign on.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (): void => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0F172A';
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // Keep receiving moves even if the finger leaves the canvas mid-stroke.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;

    const { x, y } = positionOf(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = positionOf(event);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (!hasStrokes.current) {
      hasStrokes.current = true;
      setIsEmpty(false);
    }
  };

  const end = (): void => {
    if (!drawing.current) return;
    drawing.current = false;

    const canvas = canvasRef.current;
    if (canvas && hasStrokes.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative rounded-lg border border-dashed border-border bg-card">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className={`h-40 w-full rounded-lg ${
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
          } touch-none`}
          aria-label="Zone de signature"
        />

        {isEmpty ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Signez ici avec votre souris ou votre doigt
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled || isEmpty}
        >
          Effacer
        </Button>
      </div>
    </div>
  );
}

'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { Button, cx } from '@/components/ui';

/** One captured point: CSS-pixel coordinates on the canvas and ms since the first stroke began. */
export interface SignaturePoint {
  x: number;
  y: number;
  t: number;
}
export type SignatureStrokes = SignaturePoint[][];

export interface SignatureValue {
  strokes: SignatureStrokes;
  canvas: { width: number; height: number };
}

export interface SignaturePadHandle {
  clear: () => void;
  value: () => SignatureValue;
}

// Mirrors the server limits in core_backend/signatures.py.
export const MAX_POINTS = 20000;
export const MAX_STROKES = 200;
export const MIN_POINTS = 10;
const MAX_T = 3_600_000;
const MIN_STEP_PX = 0.75;

const round2 = (n: number) => Math.round(n * 100) / 100;

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; disabled?: boolean; onChange?: (points: number, strokes: number) => void }>(
  function SignaturePad({ height = 200, disabled, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<SignatureStrokes>([]);
    const active = useRef<SignaturePoint[] | null>(null);
    const t0 = useRef<number | null>(null);
    const size = useRef({ width: 0, height });
    const [count, setCount] = useState({ points: 0, strokes: 0 });

    const total = () => strokes.current.reduce((n, s) => n + s.length, 0);

    const notify = useCallback(() => {
      const next = { points: strokes.current.reduce((n, s) => n + s.length, 0), strokes: strokes.current.length };
      setCount(next);
      onChange?.(next.points, next.strokes);
    }, [onChange]);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.current.width, size.current.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#0f172a';
      for (const stroke of strokes.current) {
        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, 1.2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    }, []);

    // The coordinate space is fixed while a signature exists: if the page layout changes width
    // (a scrollbar appearing, a resized window), the canvas scales with its aspect ratio kept and
    // pointer positions are mapped back, so a half-drawn signature is never lost or distorted.
    // An empty pad re-fits to its element.
    const fit = useCallback(() => {
      const canvas = canvasRef.current;
      const width = canvas ? Math.round(canvas.clientWidth) : 0;
      if (!canvas || !width || strokes.current.length) return;
      if (width !== size.current.width || height !== size.current.height) {
        const dpr = window.devicePixelRatio || 1;
        size.current = { width, height };
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.aspectRatio = `${width} / ${height}`;
      }
      redraw();
    }, [height, redraw]);

    const clear = useCallback(() => {
      strokes.current = [];
      active.current = null;
      t0.current = null;
      fit();
      notify();
    }, [fit, notify]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [fit]);

    useImperativeHandle(ref, () => ({
      clear,
      value: () => ({ strokes: strokes.current.map((s) => s.slice()), canvas: { ...size.current } }),
    }), [clear]);

    const pointFrom = (e: PointerEvent | React.PointerEvent): SignaturePoint => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const { width, height: h } = size.current;
      if (t0.current === null) t0.current = e.timeStamp;
      return {
        x: round2(Math.min(width, Math.max(0, ((e.clientX - rect.left) * width) / rect.width))),
        y: round2(Math.min(h, Math.max(0, ((e.clientY - rect.top) * h) / rect.height))),
        t: Math.min(MAX_T, Math.max(0, Math.round(e.timeStamp - t0.current))),
      };
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || e.button !== 0 || strokes.current.length >= MAX_STROKES || total() >= MAX_POINTS) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = [pointFrom(e)];
      strokes.current.push(active.current);
      redraw();
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = active.current;
      if (!stroke) return;
      const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        if (total() >= MAX_POINTS) break;
        const p = pointFrom(ev);
        const last = stroke[stroke.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP_PX) continue;
        stroke.push({ ...p, t: Math.max(p.t, last.t) });
      }
      redraw();
    };

    const onUp = () => {
      if (!active.current) return;
      active.current = null;
      notify();
    };

    const undo = () => {
      strokes.current.pop();
      if (!strokes.current.length) t0.current = null;
      fit();
      redraw();
      notify();
    };

    return (
      <div>
        <div className={cx('relative overflow-hidden rounded-lg border bg-white', disabled ? 'border-slate-700 opacity-60' : 'border-slate-600')}>
          <canvas
            ref={canvasRef}
            data-testid="signature-canvas"
            aria-label="Signature pad: draw your signature with a mouse, pen or finger"
            role="img"
            style={{ height: 'auto', aspectRatio: `${size.current.width || 600} / ${height}`, touchAction: 'none' }}
            className={cx('block w-full', disabled ? 'cursor-not-allowed' : 'cursor-crosshair')}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-slate-300" />
          {count.points === 0 && <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">Sign above the line</p>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 tabular-nums" data-testid="signature-stats">
            {count.strokes} stroke{count.strokes === 1 ? '' : 's'} · {count.points} point{count.points === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={Undo2} onClick={undo} disabled={disabled || count.strokes === 0}>
              Undo
            </Button>
            <Button size="sm" variant="ghost" icon={Eraser} onClick={clear} disabled={disabled || count.strokes === 0}>
              Clear
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

export default SignaturePad;

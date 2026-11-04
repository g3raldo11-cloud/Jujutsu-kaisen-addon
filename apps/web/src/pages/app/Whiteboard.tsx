import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Pen, Square, Circle, Minus, Trash2 } from 'lucide-react';
import { get } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useStore } from '../../lib/store';
import { cx } from '../../lib/format';
import type { Channel } from '../../lib/types';

interface Stroke {
  id: string;
  tool: 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse';
  color: string;
  width: number;
  points: [number, number][];
}

const COLORS = ['#e8ede7', '#c8a24a', '#ea6a62', '#52c28f', '#72aede', '#b48ef0', '#13201b'];

/** Collaborative whiteboard. Coordinates are normalised (0–1) so every screen size sees the same drawing. */
export function Whiteboard({ channel }: { channel: Channel }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Stroke['tool']>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(3);
  const [cursors, setCursors] = useState<Record<string, { x: number; y: number; t: number }>>({});
  const users = useStore((s) => s.users);
  const canDraw = channel.permissions.includes('send_messages');
  const canClear = channel.permissions.includes('manage_messages');

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const { width: w, height: h } = c;
    ctx.clearRect(0, 0, w, h);
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.save();
      ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * (w / 1000);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = s.points.map(([x, y]) => [x * w, y * h]);
      ctx.beginPath();
      if (s.tool === 'pen' || s.tool === 'eraser') {
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      } else if (pts.length >= 2) {
        const [a, b] = [pts[0], pts[pts.length - 1]];
        if (s.tool === 'line') {
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        } else if (s.tool === 'rect') ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        else ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    get<Stroke[]>(`/channels/${channel.id}/whiteboard`).then((list) => {
      strokes.current = list;
      draw();
    });
    const s = getSocket();
    const onStroke = (p: { channelId: string; stroke: Stroke }) => {
      if (p.channelId !== channel.id) return;
      strokes.current.push(p.stroke);
      draw();
    };
    const onClear = (p: { channelId: string }) => {
      if (p.channelId !== channel.id) return;
      strokes.current = [];
      draw();
    };
    const onCursor = (p: { channelId: string; userId: string; x: number; y: number }) => p.channelId === channel.id && setCursors((c) => ({ ...c, [p.userId]: { x: p.x, y: p.y, t: Date.now() } }));
    s?.on('wb:stroke', onStroke);
    s?.on('wb:clear', onClear);
    s?.on('wb:cursor', onCursor);
    return () => {
      s?.off('wb:stroke', onStroke);
      s?.off('wb:clear', onClear);
      s?.off('wb:cursor', onCursor);
    };
  }, [channel.id, draw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvas.current;
      const w = wrap.current;
      if (!c || !w) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = w.clientWidth * dpr;
      c.height = w.clientHeight * dpr;
      draw();
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [draw]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  let lastCursor = 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
        {([['pen', Pen, 'Caneta'], ['line', Minus, 'Linha'], ['rect', Square, 'Retângulo'], ['ellipse', Circle, 'Elipse'], ['eraser', Eraser, 'Borracha']] as const).map(([t, Icon, label]) => (
          <button key={t} className={cx('icon-btn', tool === t && 'bg-accent-soft text-accent')} title={label} onClick={() => setTool(t)} disabled={!canDraw}>
            <Icon className="size-4" />
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        {COLORS.map((c) => (
          <button key={c} title={c} onClick={() => setColor(c)} className={cx('size-6 rounded-full border-2', color === c ? 'border-accent' : 'border-line')} style={{ background: c }} />
        ))}
        <input type="range" min={1} max={30} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="ml-2 w-24 accent-[var(--accent)]" aria-label="Espessura" />
        <div className="flex-1" />
        {canClear && (
          <button className="btn-ghost !py-1 text-[13px]" onClick={() => getSocket()?.emit('wb:clear', { channelId: channel.id })}>
            <Trash2 className="size-4" /> Limpar quadro
          </button>
        )}
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1 touch-none bg-surface" style={{ backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        <canvas
          ref={canvas}
          className={cx('absolute inset-0 size-full', canDraw ? 'cursor-crosshair' : 'cursor-not-allowed')}
          onPointerDown={(e) => {
            if (!canDraw) return;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            current.current = { id: Math.random().toString(36).slice(2), tool, color, width: tool === 'eraser' ? width * 4 : width, points: [pos(e)] };
          }}
          onPointerMove={(e) => {
            const p = pos(e);
            if (Date.now() - lastCursor > 80) {
              lastCursor = Date.now();
              getSocket()?.emit('wb:cursor', { channelId: channel.id, x: p[0], y: p[1] });
            }
            if (!current.current) return;
            if (current.current.tool === 'pen' || current.current.tool === 'eraser') current.current.points.push(p);
            else current.current.points = [current.current.points[0], p];
            if (current.current.points.length < 2000) draw();
          }}
          onPointerUp={() => {
            const s = current.current;
            current.current = null;
            if (!s || s.points.length < 1) return;
            strokes.current.push(s);
            draw();
            getSocket()?.emit('wb:stroke', { channelId: channel.id, stroke: s });
          }}
        />
        {Object.entries(cursors)
          .filter(([, c]) => Date.now() - c.t < 4000)
          .map(([id, c]) => (
            <span key={id} className="pointer-events-none absolute -translate-x-1 -translate-y-1 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
              {users[id]?.displayName}
            </span>
          ))}
      </div>
    </div>
  );
}

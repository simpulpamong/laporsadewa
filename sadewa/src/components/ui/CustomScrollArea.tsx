'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export default function CustomScrollArea({
  id,
  label,
  children,
  className = '',
  viewportClassName = '',
  role = 'region',
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  role?: 'listbox' | 'region';
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const metricsRef = useRef({ maxScroll: 0, thumbTravel: 0 });
  const dragRef = useRef<{ pointerId: number; startY: number; startScroll: number } | null>(null);
  const [metrics, setMetrics] = useState({
    thumbHeight: 0,
    maxScroll: 0,
    thumbTravel: 0,
  });

  const syncScrollPosition = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { maxScroll, thumbTravel } = metricsRef.current;
    const thumbTop = maxScroll ? (viewport.scrollTop / maxScroll) * thumbTravel : 0;
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateY(${thumbTop}px)`;
    }
    scrollbarRef.current?.setAttribute('aria-valuenow', String(Math.round(viewport.scrollTop)));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const viewportHeight = viewport.clientHeight;
      const maxScroll = Math.max(0, viewport.scrollHeight - viewportHeight);
      const thumbHeight = maxScroll
        ? Math.max(24, (viewportHeight * viewportHeight) / viewport.scrollHeight)
        : viewportHeight;
      const thumbTravel = Math.max(0, viewportHeight - thumbHeight);
      metricsRef.current = { maxScroll, thumbTravel };
      setMetrics(previous => {
        const next = { thumbHeight, maxScroll, thumbTravel };
        return previous.thumbHeight === next.thumbHeight &&
          previous.maxScroll === next.maxScroll &&
          previous.thumbTravel === next.thumbTravel
          ? previous
          : next;
      });
      syncScrollPosition();
    };

    update();
    viewport.addEventListener('scroll', syncScrollPosition, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    if (contentRef.current) observer?.observe(contentRef.current);

    return () => {
      viewport.removeEventListener('scroll', syncScrollPosition);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    syncScrollPosition();
  }, [metrics]);

  const scrollTo = (top: number) => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = Math.max(0, Math.min(metrics.maxScroll, top));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    const onThumb = target instanceof Element && target.closest('.custom-scroll-thumb');
    event.preventDefault();

    if (onThumb) {
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScroll: viewportRef.current?.scrollTop ?? 0,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio =
      (event.clientY - bounds.top - metrics.thumbHeight / 2) / Math.max(1, metrics.thumbTravel);
    scrollTo(ratio * metrics.maxScroll);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !metrics.thumbTravel) return;
    const delta = event.clientY - drag.startY;
    scrollTo(drag.startScroll + (delta / metrics.thumbTravel) * metrics.maxScroll);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const steps: Record<string, number> = {
      ArrowDown: 36,
      ArrowUp: -36,
      PageDown: viewport.clientHeight * 0.8,
      PageUp: -viewport.clientHeight * 0.8,
      Home: -metrics.maxScroll,
      End: metrics.maxScroll,
    };
    if (!(event.key in steps)) return;
    event.preventDefault();
    scrollTo(viewport.scrollTop + steps[event.key]);
  };

  return (
    <div className={`custom-scroll-area ${className}`.trim()}>
      <div
        ref={viewportRef}
        className={`custom-scroll-viewport ${viewportClassName}`.trim()}
        id={id}
        role={role}
        aria-label={label}
        tabIndex={role === 'listbox' ? -1 : undefined}
      >
        <div ref={contentRef} className="custom-scroll-content" role="presentation">
          {children}
        </div>
      </div>
      {metrics.maxScroll > 0 && (
        <div
          ref={scrollbarRef}
          className="custom-scrollbar"
          role="scrollbar"
          aria-label={`Gulir ${label.toLowerCase()}`}
          aria-controls={id}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={metrics.maxScroll}
          aria-valuenow={0}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <span
            ref={thumbRef}
            className="custom-scroll-thumb"
            style={{ height: metrics.thumbHeight, transform: 'translateY(0)' }}
          />
        </div>
      )}
    </div>
  );
}
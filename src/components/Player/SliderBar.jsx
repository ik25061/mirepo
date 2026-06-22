import { useRef } from 'react';

export default function SliderBar({ value, max, onChange, ariaLabel, className = '' }) {
  const ref = useRef(null);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const handle = (clientX) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const newValue = ratio * max;
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onClick={(e) => handle(e.clientX)}
      onPointerDown={(e) => {
        handle(e.clientX);
        const move = (ev) => {
          ev.preventDefault();
          handle(ev.clientX);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          const step = max > 0 ? max / 100 : 1;
          onChange?.(Math.min(max, value + step));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = max > 0 ? max / 100 : 1;
          onChange?.(Math.max(0, value - step));
        }
      }}
      className={`group relative h-1.5 cursor-pointer rounded-full bg-muted ${className}`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-foreground opacity-0 shadow transition group-hover:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
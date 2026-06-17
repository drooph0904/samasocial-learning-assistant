"use client";
import { Minus, Plus } from "lucide-react";

/** Slider + numeric stepper combo for choosing question counts. */
export function StepperRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  return (
    <div className="my-2 flex items-center gap-3">
      <span className="w-28 text-xs text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
      />
      <div className="flex items-center gap-1 rounded-lg border border-border bg-panel p-0.5">
        <button onClick={() => onChange(clamp(value - 1))} className="grid h-6 w-6 place-items-center rounded-md bg-input text-muted hover:text-fg">
          <Minus size={13} />
        </button>
        <span className="w-7 text-center text-sm tabular-nums">{value}</span>
        <button onClick={() => onChange(clamp(value + 1))} className="grid h-6 w-6 place-items-center rounded-md bg-input text-muted hover:text-fg">
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

/** Conic-gradient score ring with the percentage in the center. */
export function ScoreRing({ pct }: { pct: number }) {
  const color = pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
  return (
    <div
      className="grid h-24 w-24 flex-none place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} 0 ${pct}%, var(--input) ${pct}% 100%)` }}
    >
      <div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-panel-2 text-xl font-extrabold text-fg">
        {pct}%
      </div>
    </div>
  );
}


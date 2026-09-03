export default function ProgressBar({ value, graduated }: { value: number; graduated: boolean }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${graduated ? "bg-up" : "bg-accent"}`}
        style={{ width: `${graduated ? 100 : pct}%` }}
      />
    </div>
  );
}

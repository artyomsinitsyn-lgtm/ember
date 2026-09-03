import type { Milestone } from "@/lib/projects";

const STATUS_DOT: Record<Milestone["status"], string> = {
  planned: "bg-text-dim/50",
  in_progress: "bg-accent",
  done: "bg-up",
};

export default function RoadmapPanel({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium mb-3">Roadmap</h2>
      <div className="flex flex-col gap-3">
        {milestones.map((m) => (
          <div key={m.id} className="flex items-start gap-3">
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_DOT[m.status]}`} />
            <div className="min-w-0">
              <div className="text-xs font-medium flex items-center gap-2 flex-wrap">
                {m.title}
                {m.targetDate && <span className="text-[10px] text-text-dim mono">{m.targetDate}</span>}
              </div>
              {m.detail && <div className="text-xs text-text-dim mt-0.5">{m.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

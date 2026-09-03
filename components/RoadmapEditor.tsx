"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Milestone } from "@/lib/projects";

const STATUS_CYCLE: Milestone["status"][] = ["planned", "in_progress", "done"];
const STATUS_LABEL: Record<Milestone["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};
const MAX_ITEMS = 12;

/** Shared add/remove/status-cycle milestone list UI — used by both the token page's
 * EditProjectPanel and /create's "Idea / Project" tab, so the roadmap-building UX is
 * identical whether you're launching fresh or upgrading an existing token. */
export default function RoadmapEditor({
  milestones,
  onChange,
}: {
  milestones: Milestone[];
  onChange: (next: Milestone[]) => void;
}) {
  function addMilestone() {
    if (milestones.length >= MAX_ITEMS) return;
    onChange([...milestones, { id: `m${Date.now()}`, title: "", status: "planned" }]);
  }

  function updateMilestone(i: number, patch: Partial<Milestone>) {
    onChange(milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function removeMilestone(i: number) {
    onChange(milestones.filter((_, idx) => idx !== i));
  }

  function cycleStatus(i: number) {
    const current = milestones[i].status;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    updateMilestone(i, { status: next });
  }

  return (
    <div className="flex flex-col gap-2">
      {milestones.map((m, i) => (
        <div key={m.id} className="bg-bg-elevated rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cycleStatus(i)}
              className={`glow-hover press-effect shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                m.status === "done"
                  ? "bg-up/15 text-up"
                  : m.status === "in_progress"
                  ? "bg-accent/15 text-accent"
                  : "bg-bg text-text-dim border border-border"
              }`}
            >
              {STATUS_LABEL[m.status]}
            </button>
            <input
              value={m.title}
              onChange={(e) => updateMilestone(i, { title: e.target.value.slice(0, 80) })}
              placeholder="Milestone title"
              className="flex-1 bg-transparent text-sm outline-none min-w-0"
            />
            <button
              type="button"
              onClick={() => removeMilestone(i)}
              aria-label="Remove milestone"
              className="glow-hover press-effect shrink-0 text-text-dim hover:text-down"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={m.detail ?? ""}
            onChange={(e) => updateMilestone(i, { detail: e.target.value.slice(0, 300) })}
            placeholder="Detail (optional)"
            rows={2}
            className="bg-transparent text-xs text-text-dim outline-none resize-none"
          />
          <input
            type="date"
            value={m.targetDate ?? ""}
            onChange={(e) => updateMilestone(i, { targetDate: e.target.value || null })}
            className="bg-transparent text-xs text-text-dim outline-none w-fit"
          />
        </div>
      ))}
      {milestones.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={addMilestone}
          className="glow-hover press-effect flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-bg-elevated border border-border hover:border-accent/50 transition-colors"
        >
          <Plus size={13} />
          Add milestone
        </button>
      )}
    </div>
  );
}

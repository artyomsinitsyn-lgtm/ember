"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import RoadmapEditor from "./RoadmapEditor";
import type { SerializedProject, Milestone } from "@/lib/projects";

export default function EditProjectPanel({
  tokenId,
  project,
  onSaved,
}: {
  tokenId: string;
  project: SerializedProject | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tagline, setTagline] = useState(project?.tagline ?? "");
  const [details, setDetails] = useState(project?.details ?? "");
  const [discord, setDiscord] = useState(project?.discord ?? "");
  const [github, setGithub] = useState(project?.github ?? "");
  const [roadmap, setRoadmap] = useState<Milestone[]>(project?.roadmap ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagline, details, discord, github, roadmap }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="glow-hover press-effect card p-3 flex items-center gap-2 text-xs text-text-dim hover:text-text w-fit"
      >
        <Layers size={14} />
        {project ? "Edit project details" : "Turn this into a Project"}
      </button>
    );
  }

  return (
    <div className="card p-4 flex flex-col gap-4">
      <h2 className="text-sm font-medium">{project ? "Edit project details" : "Turn this into a Project"}</h2>

      <div>
        <label className="text-xs text-text-dim uppercase tracking-wide">Tagline</label>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value.slice(0, 140))}
          placeholder="A one-line pitch shown on cards"
          className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="text-xs text-text-dim uppercase tracking-wide">Full description</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 4000))}
          rows={4}
          placeholder="What are you building, and why?"
          className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-dim uppercase tracking-wide">Discord</label>
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value.slice(0, 200))}
            placeholder="https://discord.gg/..."
            className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-dim uppercase tracking-wide">GitHub</label>
          <input
            value={github}
            onChange={(e) => setGithub(e.target.value.slice(0, 200))}
            placeholder="https://github.com/..."
            className="mt-1 w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-text-dim uppercase tracking-wide mb-1.5 block">Roadmap</label>
        <RoadmapEditor milestones={roadmap} onChange={setRoadmap} />
      </div>

      {error && <div className="text-xs text-down">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-4 py-2 rounded-full text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

import { MessageCircle, GitBranch } from "lucide-react";
import type { SerializedProject } from "@/lib/projects";

export default function ProjectAboutPanel({ project }: { project: SerializedProject }) {
  if (!project.details && !project.discord && !project.github) return null;
  return (
    <div className="card p-4 flex flex-col gap-3">
      <h2 className="text-sm font-medium">About this project</h2>
      {project.details && <p className="text-sm text-text-dim leading-relaxed whitespace-pre-wrap">{project.details}</p>}
      {(project.discord || project.github) && (
        <div className="flex items-center gap-2">
          {project.discord && (
            <a
              href={project.discord}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="glow-hover press-effect card p-2 flex items-center justify-center text-text-dim hover:text-text"
            >
              <MessageCircle size={14} />
            </a>
          )}
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="glow-hover press-effect card p-2 flex items-center justify-center text-text-dim hover:text-text"
            >
              <GitBranch size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

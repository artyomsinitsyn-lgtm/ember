/** Just two types, no category list — a token either has project metadata attached
 * (roadmap/pitch/etc., "Idea") or it doesn't (a plain "Token"). Uniform gray either way,
 * no color-coding — this is a classification tag, not another decorative accent. */
export default function TypeChip({ isProject }: { isProject: boolean }) {
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-elevated border border-border text-text-dim whitespace-nowrap">
      {isProject ? "Idea" : "Token"}
    </span>
  );
}

import { redirect } from "next/navigation";

/** /board was folded into /ideas (Trending/New/Most Backed/Growing/Established Creators +
 * a category filter now cover what Board's 4 tabs used to). Kept as a redirect, not
 * deleted, so old bookmarks/links don't 404 — every internal link now points at /ideas
 * directly instead of bouncing through this. */
export default function BoardPage() {
  redirect("/ideas?type=token");
}

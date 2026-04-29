"use client";

import { useState, useTransition } from "react";
import { createComment, deleteComment, type Comment } from "@/lib/actions/comments";

interface Props {
  targetId: string;
  initialComments?: Comment[];
  showRating?: boolean;
  allowDelete?: boolean;
}

export function CommentForm({
  targetId,
  initialComments = [],
  showRating = true,
  allowDelete = false,
}: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("targetId", targetId);

    startTransition(async () => {
      const result = await createComment(data);
      if (!result.ok) {
        setError(result.error ?? "Could not save comment");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if (result.comments) setComments(result.comments);
      form.reset();
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteComment(id, targetId);
      if (result.ok && result.comments) setComments(result.comments);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Leave a comment</h3>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="cf-name">
              Name
            </label>
            <input
              id="cf-name"
              name="authorName"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E40AF] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
            />
            {fieldErrors.authorName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.authorName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="cf-email">
              Email (optional)
            </label>
            <input
              id="cf-email"
              name="authorEmail"
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E40AF] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
            />
            {fieldErrors.authorEmail && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.authorEmail}</p>
            )}
          </div>
        </div>

        {showRating && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="cf-rating">
              Rating
            </label>
            <select
              id="cf-rating"
              name="rating"
              defaultValue=""
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E40AF] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
            >
              <option value="">No rating</option>
              <option value="5">★★★★★</option>
              <option value="4">★★★★</option>
              <option value="3">★★★</option>
              <option value="2">★★</option>
              <option value="1">★</option>
            </select>
            {fieldErrors.rating && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.rating}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="cf-body">
            Comment
          </label>
          <textarea
            id="cf-body"
            name="body"
            required
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1E40AF] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
          />
          {fieldErrors.body && <p className="mt-1 text-xs text-red-600">{fieldErrors.body}</p>}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post comment"}
        </button>
      </form>

      <ul className="space-y-3">
        {comments.length === 0 ? (
          <li className="text-sm text-gray-500">No comments yet — be the first.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{c.authorName}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleString()}
                    {c.rating ? ` · ${"★".repeat(c.rating)}` : ""}
                  </p>
                </div>
                {allowDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{c.body}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

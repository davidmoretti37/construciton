"use client";

import { useState } from "react";
import type { PortalPhoto } from "@/services/portal";

interface Props {
  photos: PortalPhoto[];
  projectId: string;
}

export default function PhotoTimeline({ photos, projectId }: Props) {
  const [selectedPhoto, setSelectedPhoto] = useState<PortalPhoto | null>(null);

  // Group photos by date
  const grouped = photos.reduce<Record<string, PortalPhoto[]>>((acc, photo) => {
    const date = photo.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(photo);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (photos.length === 0) return null;

  return (
    <>
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Photo Timeline ({photos.length})
        </h2>

        <div className="space-y-5">
          {dates.map((date) => (
            <div key={date}>
              <p className="text-[10px] text-gray-400 uppercase font-medium mb-2">
                {new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {grouped[date].map((photo, i) => (
                  <button
                    key={`${date}-${i}`}
                    onClick={() => setSelectedPhoto(photo)}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || `Photo from ${date}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedPhoto.url}
            alt={selectedPhoto.caption || "Photo"}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedPhoto.caption && (
            <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-4 py-2 rounded-lg">
              {selectedPhoto.caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}

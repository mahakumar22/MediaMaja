"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isNeutral,
  LIMITS,
  NEUTRAL,
  NUMERIC_KEYS,
  type Adjustments,
} from "@/lib/adjustments";
import { knownPhrases, parseInstruction } from "@/lib/parse";
import { renderToCanvas } from "@/lib/render";

const EXAMPLES = [
  "make it brighter and a bit warmer",
  "black and white with more contrast",
  "vintage look",
  "moody and cinematic",
  "slightly softer, add a vignette",
  "rotate right",
];

/**
 * One photo in the tray. Each keeps its own adjustments and its own undo
 * history, so switching between pictures never loses work on either.
 */
type Photo = {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  adjustments: Adjustments;
  history: Adjustments[];
};

type Feedback = { applied: string[]; unsupported: string[]; unknown: string[] };

const NO_FEEDBACK: Feedback = { applied: [], unsupported: [], unknown: [] };

export function Editor() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(NO_FEEDBACK);
  const [showBefore, setShowBefore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = photos.find((photo) => photo.id === activeId) ?? null;

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    renderToCanvas(active.image, canvasRef.current, showBefore ? NEUTRAL : active.adjustments);
  }, [active, showBefore]);

  // Object URLs are held for the life of the tray, so they are released only
  // when a photo is removed or the page goes away.
  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const rejected = Array.from(files).length - images.length;

    setLoadError(
      rejected > 0
        ? `${rejected} file${rejected === 1 ? " was" : "s were"} skipped — only images can be edited.`
        : null,
    );

    for (const file of images) {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const photo: Photo = {
          id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          name: file.name,
          url,
          image,
          adjustments: NEUTRAL,
          history: [],
        };
        setPhotos((current) => [...current, photo]);
        setActiveId((current) => current ?? photo.id);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        setLoadError(`"${file.name}" could not be opened. It may be damaged.`);
      };
      image.src = url;
    }
  }, []);

  function updateActive(change: (photo: Photo) => Photo) {
    setPhotos((current) =>
      current.map((photo) => (photo.id === activeId ? change(photo) : photo)),
    );
  }

  function runInstruction(text: string) {
    if (!text.trim() || !active) return;

    const result = parseInstruction(text, active.adjustments);
    updateActive((photo) => ({
      ...photo,
      adjustments: result.adjustments,
      history: [...photo.history, photo.adjustments],
    }));
    setFeedback({
      applied: result.applied,
      unsupported: result.unsupported,
      unknown: result.unknown,
    });
    setInstruction("");
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const going = current.find((photo) => photo.id === id);
      if (going) URL.revokeObjectURL(going.url);

      const remaining = current.filter((photo) => photo.id !== id);
      if (id === activeId) {
        // Land on the next photo along, or the previous one at the end.
        const wasAt = current.findIndex((photo) => photo.id === id);
        const nextActive = remaining[Math.min(wasAt, remaining.length - 1)];
        setActiveId(nextActive?.id ?? null);
        setFeedback(NO_FEEDBACK);
      }
      return remaining;
    });
  }

  function download(photo: Photo) {
    const canvas = document.createElement("canvas");
    renderToCanvas(photo.image, canvas, photo.adjustments);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `edited-${photo.name.replace(/\.[^.]+$/, "")}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (photos.length === 0) {
    return <DropZone onFiles={addFiles} error={loadError} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PhotoTray
        photos={photos}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setFeedback(NO_FEEDBACK);
          setShowBefore(false);
        }}
        onRemove={removePhoto}
        onFiles={addFiles}
      />

      {loadError ? (
        <p role="alert" className="text-sm text-red-500">
          {loadError}
        </p>
      ) : null}

      {active ? (
        <>
          <div className="relative overflow-hidden rounded-xl border border-border bg-canvas">
            <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[55vh] w-auto max-w-full" />
            <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
              {showBefore ? "Original" : active.name}
            </span>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              runInstruction(instruction);
            }}
            className="flex gap-2"
          >
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                // Enter applies; Shift+Enter starts a new line, so a paragraph
                // can still be typed or pasted in.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  runInstruction(instruction);
                }
              }}
              rows={2}
              placeholder="Describe the change — a word, a sentence, or a whole paragraph"
              aria-label="Describe the change you want"
              className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted/60"
            />
            <button
              type="submit"
              className="h-fit shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Apply
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => runInstruction(example)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>

          <FeedbackPanel feedback={feedback} />

          <div className="flex flex-wrap gap-2">
            <Action onClick={() => setShowBefore((value) => !value)}>
              {showBefore ? "Show edited" : "Compare with original"}
            </Action>
            <Action
              onClick={() =>
                updateActive((photo) =>
                  photo.history.length === 0
                    ? photo
                    : {
                        ...photo,
                        adjustments: photo.history[photo.history.length - 1],
                        history: photo.history.slice(0, -1),
                      },
                )
              }
              disabled={active.history.length === 0}
            >
              Undo
            </Action>
            <Action
              onClick={() =>
                updateActive((photo) => ({
                  ...photo,
                  adjustments: NEUTRAL,
                  history: [...photo.history, photo.adjustments],
                }))
              }
              disabled={isNeutral(active.adjustments)}
            >
              Reset this photo
            </Action>
            <button
              type="button"
              onClick={() => download(active)}
              className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Download
            </button>
            {photos.length > 1 ? (
              <Action onClick={() => photos.forEach(download)}>Download all {photos.length}</Action>
            ) : null}
          </div>

          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Fine-tune by hand</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {NUMERIC_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted">{LIMITS[key].label}</span>
                  <input
                    type="range"
                    min={LIMITS[key].min}
                    max={LIMITS[key].max}
                    value={active.adjustments[key]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateActive((photo) => ({
                        ...photo,
                        adjustments: { ...photo.adjustments, [key]: value },
                        history: [...photo.history, photo.adjustments],
                      }));
                    }}
                    className="min-w-0 flex-1"
                  />
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted">
                    {active.adjustments[key]}
                  </span>
                </label>
              ))}
            </div>
          </details>

          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Words it understands</summary>
            <p className="mt-3 text-sm text-muted">{knownPhrases().join(" · ")}</p>
            <p className="mt-2 text-sm text-muted">
              Add &quot;a bit&quot; or &quot;slightly&quot; to go gentler, &quot;much&quot; or
              &quot;way&quot; to go harder, and &quot;less&quot; or &quot;remove&quot; to go the
              other way. Full sentences and paragraphs are fine — it picks out the parts it
              recognises.
            </p>
          </details>
        </>
      ) : null}
    </div>
  );
}

function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  const { applied, unsupported, unknown } = feedback;
  if (applied.length === 0 && unsupported.length === 0 && unknown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      {applied.length > 0 ? (
        <p>
          <span className="text-muted">Understood: </span>
          {applied.join(", ")}
        </p>
      ) : null}

      {unsupported.length > 0 ? (
        <p className="text-amber-600 dark:text-amber-400">
          This app only adjusts light, colour and texture, so it cannot help with{" "}
          {unsupported.join(", ")}. Everything else in your description was applied.
        </p>
      ) : null}

      {unknown.length > 0 ? (
        <p className="text-amber-600 dark:text-amber-400">
          Not sure what to do with {unknown.map((phrase) => `"${phrase}"`).join(", ")}. Try
          different wording, or use the sliders below.
        </p>
      ) : null}
    </div>
  );
}

function PhotoTray({
  photos,
  activeId,
  onSelect,
  onRemove,
  onFiles,
}: {
  photos: Photo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onFiles: (files: FileList) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {photos.map((photo) => (
        <div key={photo.id} className="relative shrink-0">
          <button
            type="button"
            onClick={() => onSelect(photo.id)}
            aria-current={photo.id === activeId}
            title={photo.name}
            className={`block size-16 overflow-hidden rounded-lg border-2 transition-colors ${
              photo.id === activeId ? "border-accent" : "border-border hover:border-accent/50"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.name} className="size-full object-cover" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(photo.id)}
            aria-label={`Remove ${photo.name}`}
            title={`Remove ${photo.name}`}
            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-card text-xs leading-none text-muted transition-colors hover:border-red-500 hover:text-red-500"
          >
            ×
          </button>
        </div>
      ))}

      <label
        title="Add more photos"
        className="grid size-16 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-2xl text-muted transition-colors hover:border-accent hover:text-accent"
      >
        +
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function Action({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-accent disabled:opacity-40 disabled:hover:border-border"
    >
      {children}
    </button>
  );
}

function DropZone({
  onFiles,
  error,
}: {
  onFiles: (files: FileList) => void;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-16 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <span className="text-sm font-medium">Drop photos here</span>
        <span className="text-sm text-muted">or click to choose — you can pick several at once</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

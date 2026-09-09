"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isNeutral,
  LIMITS,
  NEUTRAL,
  NUMERIC_KEYS,
  type Adjustments,
  type NumericKey,
} from "@/lib/adjustments";
import { knownPhrases, parseInstruction } from "@/lib/parse";
import { renderToCanvas } from "@/lib/render";

const EXAMPLES = [
  "make it brighter and a bit warmer",
  "black and white with more contrast",
  "vintage look",
  "slightly softer, add a vignette",
  "much more vivid",
  "rotate right",
];

type Loaded = { image: HTMLImageElement; name: string };

export function Editor() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments>(NEUTRAL);
  const [history, setHistory] = useState<Adjustments[]>([]);
  const [instruction, setInstruction] = useState("");
  const [applied, setApplied] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [showBefore, setShowBefore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Re-render whenever the picture or the numbers change.
  useEffect(() => {
    if (!loaded || !canvasRef.current) return;
    renderToCanvas(loaded.image, canvasRef.current, showBefore ? NEUTRAL : adjustments);
  }, [loaded, adjustments, showBefore]);

  const openFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setLoadError("That is not an image file. Try a JPG, PNG, WebP or GIF.");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      setLoaded({ image, name: file.name });
      setAdjustments(NEUTRAL);
      setHistory([]);
      setApplied([]);
      setUnknown([]);
      setLoadError(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setLoadError("That image could not be opened. It may be damaged.");
    };
    image.src = url;
  }, []);

  function runInstruction(text: string) {
    if (!text.trim() || !loaded) return;

    const result = parseInstruction(text, adjustments);
    setHistory((past) => [...past, adjustments]);
    setAdjustments(result.adjustments);
    setApplied(result.applied);
    setUnknown(result.unknown);
    setInstruction("");
  }

  function undo() {
    setHistory((past) => {
      if (past.length === 0) return past;
      setAdjustments(past[past.length - 1]);
      setApplied([]);
      setUnknown([]);
      return past.slice(0, -1);
    });
  }

  function setSlider(key: NumericKey, value: number) {
    setHistory((past) => [...past, adjustments]);
    setAdjustments((current) => ({ ...current, [key]: value }));
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `edited-${loaded.name.replace(/\.[^.]+$/, "")}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (!loaded) {
    return <DropZone onFile={openFile} error={loadError} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative overflow-hidden rounded-xl border border-border bg-canvas">
        <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[60vh] w-auto max-w-full" />
        {showBefore ? (
          <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
            Original
          </span>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          runInstruction(instruction);
        }}
        className="flex gap-2"
      >
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Describe the change — e.g. brighter and a bit warmer"
          aria-label="Describe the change you want"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted/60"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
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

      {applied.length > 0 || unknown.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          {applied.length > 0 ? (
            <p>
              <span className="text-muted">Understood: </span>
              {applied.join(", ")}
            </p>
          ) : null}
          {unknown.length > 0 ? (
            <p className="text-amber-600 dark:text-amber-400">
              Not understood: {unknown.map((phrase) => `"${phrase}"`).join(", ")}. Try wording it
              differently, or use the sliders below.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Action onClick={() => setShowBefore((value) => !value)}>
          {showBefore ? "Show edited" : "Compare with original"}
        </Action>
        <Action onClick={undo} disabled={history.length === 0}>
          Undo
        </Action>
        <Action
          onClick={() => {
            setHistory((past) => [...past, adjustments]);
            setAdjustments(NEUTRAL);
            setApplied([]);
            setUnknown([]);
          }}
          disabled={isNeutral(adjustments)}
        >
          Reset all
        </Action>
        <Action onClick={() => setLoaded(null)}>Use another photo</Action>
        <button
          type="button"
          onClick={download}
          className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Download
        </button>
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
                value={adjustments[key]}
                onChange={(event) => setSlider(key, Number(event.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="w-10 shrink-0 text-right tabular-nums text-muted">
                {adjustments[key]}
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
          &quot;way&quot; to go harder, and &quot;less&quot; or &quot;remove&quot; to go the other
          way.
        </p>
      </details>
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

function DropZone({ onFile, error }: { onFile: (file: File) => void; error: string | null }) {
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
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-16 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <span className="text-sm font-medium">Drop a photo here</span>
        <span className="text-sm text-muted">or click to choose one</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
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

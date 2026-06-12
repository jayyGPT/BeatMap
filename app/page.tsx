"use client";

import React, { useState, useCallback, useRef } from "react";
import Timeline, { type TimelineHit } from "./components/Timeline";

/* ─── Types ──────────────────────────────────────────────────────── */
interface AnalysisResult {
  track_length: number;
  timeline: TimelineHit[];
}

type AppState = "idle" | "uploading" | "analyzing" | "done" | "error";

/* ─── Debounce / cleanup function ────────────────────────────────── */
const DEBOUNCE_WINDOW = 0.3; // seconds

function debounceTimeline(hits: TimelineHit[]): TimelineHit[] {
  if (hits.length === 0) return [];

  const sorted = [...hits].sort((a, b) => a.time - b.time);
  const result: TimelineHit[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameInstrument =
      next.instrument.toLowerCase() === current.instrument.toLowerCase();
    const withinWindow = next.time - current.time <= DEBOUNCE_WINDOW;

    if (sameInstrument && withinWindow) {
      if (next.confidence > current.confidence) {
        current = next;
      }
    } else {
      result.push(current);
      current = next;
    }
  }
  result.push(current);

  return result;
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [cleanedTimeline, setCleanedTimeline] = useState<TimelineHit[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "wav" && ext !== "mp3") {
      setError("Invalid format. Only .wav and .mp3 accepted.");
      setState("error");
      return;
    }

    setFileName(file.name);
    setFileSize(formatSize(file.size));
    setError("");
    setResult(null);
    // Create blob URL for audio playback
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const blobUrl = URL.createObjectURL(file);
    setAudioUrl(blobUrl);
    setState("analyzing");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("https://jayy02-beatmap-api.hf.space/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data: AnalysisResult = await res.json();
      setRawCount(data.timeline.length);

      const cleaned = debounceTimeline(data.timeline);
      setCleanedTimeline(cleaned);
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) handleFile(e.target.files[0]);
    },
    [handleFile]
  );

  const handleReset = () => {
    setState("idle");
    setError("");
    setFileName("");
    setFileSize("");
    setResult(null);
    setCleanedTimeline([]);
    setRawCount(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deduped = rawCount - cleanedTimeline.length;

  return (
    <main className="flex-1 flex flex-col">
      <div className="max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="animate-in">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              BeatMap
            </h1>
            <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              audio timeline analyzer
            </span>
          </div>
          <div
            className="mt-2 h-px w-full"
            style={{ background: "var(--border-hard)" }}
          />
        </header>

        {/* ── Upload ──────────────────────────────────────────── */}
        {(state === "idle" || state === "error") && (
          <section className="animate-in">
            <div
              id="upload-dropzone"
              className={`dropzone px-8 py-10 flex flex-col items-center gap-3 ${
                dragOver ? "drag-over" : ""
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                id="file-input"
                type="file"
                accept=".wav,.mp3"
                className="hidden"
                onChange={handleInputChange}
              />

              <div className="text-2xl" style={{ color: "var(--text-muted)" }}>
                ↑
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Drop audio file here
                </p>
                <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
                  .wav · .mp3
                </p>
              </div>
            </div>

            {/* Error */}
            {state === "error" && (
              <div className="mt-3 card px-4 py-3 flex items-center justify-between" style={{ borderColor: "var(--error)" }}>
                <span className="text-xs font-mono" style={{ color: "var(--error)" }}>
                  ERR: {error}
                </span>
                <button onClick={handleReset} className="btn text-[10px]">
                  retry
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Analyzing ───────────────────────────────────────── */}
        {state === "analyzing" && (
          <div className="card px-5 py-4 animate-in">
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)", animation: "blink 1s infinite" }}
              />
              <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                analyzing {fileName} ({fileSize})
              </span>
            </div>
            <div className="loading-bar" />
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────── */}
        {state === "done" && result && (
          <div className="flex flex-col gap-4 animate-in">
            {/* Info bar */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                  ✓ {fileName}
                </span>
                {deduped > 0 && (
                  <span className="text-[10px] font-mono" style={{ color: "var(--tom-color)" }}>
                    ({deduped} duplicate{deduped !== 1 ? "s" : ""} cleaned)
                  </span>
                )}
              </div>
              <button onClick={handleReset} className="btn text-[10px]">
                new file
              </button>
            </div>

            {/* Timeline */}
            <div className="card p-4">
              <Timeline
                trackLength={result.track_length}
                timeline={cleanedTimeline}
                audioUrl={audioUrl}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="mt-auto py-4 text-center">
        <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
          beatmap · v0.1
        </p>
      </footer>
    </main>
  );
}

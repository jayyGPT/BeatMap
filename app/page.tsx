"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Timeline, { type TimelineHit } from "./components/Timeline";

/* ─── Types ──────────────────────────────────────────────────────── */
interface AnalysisResult {
  track_length: number;
  timeline: TimelineHit[];
}

type AppState = "idle" | "uploading" | "analyzing" | "done" | "error";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("theme-light");
    } else {
      document.documentElement.classList.remove("theme-light");
    }
  }, [theme]);

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
    setState("analyzing");

    try {
      const blobUrl = URL.createObjectURL(file);
      
      // Check audio duration
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(blobUrl);
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error("Failed to load audio metadata"));
      });

      if (duration >= 180) {
        URL.revokeObjectURL(blobUrl);
        throw new Error("Audio must be less than 3 minutes long.");
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(blobUrl);

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

      setCleanedTimeline(data.timeline);
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, [audioUrl]);

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

  return (
    <main className="flex-1 flex flex-col">
      <div className="max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="animate-in flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)", textShadow: "var(--retro-shadow)" }}>
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
          </div>
          <button
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            className="btn font-bold uppercase tracking-widest text-[10px]"
          >
            {theme === "dark" ? "☀ Cassette Mode" : "☽ Tube Mode"}
          </button>
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

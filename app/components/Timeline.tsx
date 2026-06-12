"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ─── Types ──────────────────────────────────────────────────────── */
export interface TimelineHit {
  time: number;
  instrument: string;
  confidence: number;
}

interface TimelineProps {
  trackLength: number;
  timeline: TimelineHit[];
  audioUrl?: string | null;
}

/* ─── Instrument → lane mapping ──────────────────────────────────── */
type Lane = "kick" | "snare" | "hat" | "tom";

const LANES: { key: Lane; label: string; shortcut: string }[] = [
  { key: "kick", label: "KICK", shortcut: "K" },
  { key: "snare", label: "SNARE", shortcut: "S" },
  { key: "hat", label: "HAT/CYM", shortcut: "H" },
  { key: "tom", label: "TOM", shortcut: "T" },
];

function classifyInstrument(instrument: string): Lane {
  const name = instrument.toLowerCase();
  if (name.includes("kick") || name.includes("bass")) return "kick";
  if (name.includes("snare") || name.includes("rim")) return "snare";
  if (
    name.includes("hat") ||
    name.includes("cymbal") ||
    name.includes("hi-hat") ||
    name.includes("hihat") ||
    name.includes("crash") ||
    name.includes("ride")
  )
    return "hat";
  return "tom";
}

/* ─── Format time ────────────────────────────────────────────────── */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

/* ─── Timeline component ────────────────────────────────────────── */
export default function Timeline({ trackLength, timeline, audioUrl }: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  /* ── Audio playback state ──────────────────────────────────────── */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [activeHits, setActiveHits] = useState<Set<string>>(new Set());
  const lastCheckedTimeRef = useRef(0);

  /* Group hits by lane */
  const hitsByLane = useMemo(() => {
    const grouped: Record<Lane, TimelineHit[]> = {
      kick: [],
      snare: [],
      hat: [],
      tom: [],
    };
    for (const hit of timeline) {
      const lane = classifyInstrument(hit.instrument);
      grouped[lane].push(hit);
    }
    return grouped;
  }, [timeline]);

  /* All hits with unique IDs for flash tracking */
  const hitsWithIds = useMemo(() => {
    return timeline.map((hit, i) => ({
      ...hit,
      id: `${classifyInstrument(hit.instrument)}-${i}`,
      lane: classifyInstrument(hit.instrument),
    }));
  }, [timeline]);

  const totalHits = timeline.length;

  /* Generate smart time markers */
  const timeMarkers = useMemo(() => {
    const visibleDuration = trackLength / zoom;
    const targetMarkerCount = 12; // Keep number of visible markers constant to avoid text overlap

    const niceIntervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const rawInterval = visibleDuration / targetMarkerCount;
    const interval = niceIntervals.find((n) => n >= rawInterval) ?? 1;

    const markers: { time: number; pct: number; label: string; major: boolean }[] = [];
    for (let t = 0; t <= trackLength; t += interval) {
      markers.push({
        time: t,
        pct: (t / trackLength) * 100,
        label: formatTime(t),
        major: t % (interval * 4) < 0.001 || t === 0,
      });
    }
    if (!markers.find((m) => Math.abs(m.time - trackLength) < 0.01)) {
      markers.push({
        time: trackLength,
        pct: 100,
        label: formatTime(trackLength),
        major: true,
      });
    }
    return markers;
  }, [trackLength, zoom]);

  const gridBgSize = useMemo(() => {
    const markerCount = timeMarkers.length;
    if (markerCount <= 1) return "10%";
    return `${100 / (markerCount - 1)}%`;
  }, [timeMarkers]);

  /* ── Audio engine ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const onEnded = () => {
      setIsPlaying(false);
      setPlaybackTime(0);
      setActiveHits(new Set());
      lastCheckedTimeRef.current = 0;
    };

    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioUrl]);

  /* rAF loop: sync playhead + flash hits */
  const tick = useCallback(function tickFn() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const t = audio.currentTime;
    setPlaybackTime(t);

    // Check which hits should flash (crossed since last tick)
    const prev = lastCheckedTimeRef.current;
    const newActive = new Set<string>();

    for (const hit of hitsWithIds) {
      // Hit is between prev and current time → just crossed
      if (hit.time > prev && hit.time <= t) {
        newActive.add(hit.id);
      }
    }

    if (newActive.size > 0) {
      setActiveHits((existing) => {
        const merged = new Set(existing);
        newActive.forEach((id) => merged.add(id));
        return merged;
      });

      // Clear flash after animation duration
      setTimeout(() => {
        setActiveHits((existing) => {
          const next = new Set(existing);
          newActive.forEach((id) => next.delete(id));
          return next;
        });
      }, 300);
    }

    lastCheckedTimeRef.current = t;

    // Auto-scroll to keep playhead visible
    if (scrollRef.current && trackAreaRef.current && zoom > 1) {
      const scrollContainer = scrollRef.current;
      const pct = t / trackLength;
      const totalWidth = trackAreaRef.current.parentElement?.scrollWidth || 0;
      const playheadX = pct * totalWidth;
      const viewLeft = scrollContainer.scrollLeft;
      const viewRight = viewLeft + scrollContainer.clientWidth;

      if (playheadX < viewLeft + 60 || playheadX > viewRight - 60) {
        scrollContainer.scrollLeft = playheadX - scrollContainer.clientWidth / 3;
      }
    }

    rafRef.current = requestAnimationFrame(tickFn);
  }, [hitsWithIds, trackLength, zoom]);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      audio.play();
      lastCheckedTimeRef.current = audio.currentTime;
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [isPlaying, tick]);

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlaybackTime(0);
    setActiveHits(new Set());
    lastCheckedTimeRef.current = 0;
  }, []);

  const handleScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = pct * trackLength;
      audio.currentTime = newTime;
      setPlaybackTime(newTime);
      lastCheckedTimeRef.current = newTime;
    },
    [trackLength]
  );

  /* Cursor tracking on hover (only when not playing) */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPlaying) return;
      const rect = trackAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      setCursorTime(pct * trackLength);
    },
    [trackLength, isPlaying]
  );

  const handleMouseLeave = useCallback(() => {
    setCursorTime(null);
  }, []);

  /* Keyboard: +/- zoom, space = play/pause */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "=" || e.key === "+") {
        setZoom((z) => Math.min(z + 0.5, 8));
      } else if (e.key === "-" || e.key === "_") {
        setZoom((z) => Math.max(z - 0.5, 1));
      } else if (e.key === " " && audioUrl) {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioUrl, handlePlay]);

  const playbackPct = trackLength > 0 ? (playbackTime / trackLength) * 100 : 0;

  return (
    <div id="timeline-visualizer" className="animate-in flex flex-col gap-0">
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {totalHits} hits &middot; {formatTime(trackLength)}
          </span>
          <div className="flex gap-1.5">
            {LANES.map((lane) => {
              const count = hitsByLane[lane.key].length;
              if (count === 0) return null;
              return (
                <span key={lane.key} className={`tag tag-${lane.key}`}>
                  {lane.shortcut}:{count}
                </span>
              );
            })}
          </div>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            ZOOM
          </span>
          <button
            className="btn px-2 py-0.5 text-[10px]"
            onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
            aria-label="Zoom out"
          >
            −
          </button>
          <input
            type="range"
            min="1"
            max="8"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20"
            aria-label="Zoom level"
          />
          <button
            className="btn px-2 py-0.5 text-[10px]"
            onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}
            aria-label="Zoom in"
          >
            +
          </button>
          <span
            className="text-[10px] font-mono w-8 text-right"
            style={{ color: "var(--text-secondary)" }}
          >
            {zoom}×
          </span>
        </div>
      </div>

      {/* ── Transport bar (play/pause/stop + scrubber) ─────────── */}
      {audioUrl && (
        <div className="transport mb-3">
          {/* Play/Pause */}
          <button
            className={`transport-btn ${isPlaying ? "active" : ""}`}
            onClick={handlePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>

          {/* Stop */}
          <button
            className="transport-btn"
            onClick={handleStop}
            aria-label="Stop"
            title="Stop"
          >
            ■
          </button>

          {/* Current time */}
          <span
            className="text-[10px] font-mono w-16 text-center"
            style={{ color: isPlaying ? "var(--success)" : "var(--text-secondary)" }}
          >
            {formatTime(playbackTime)}
          </span>

          {/* Scrubber */}
          <div className="scrubber-track" onClick={handleScrub}>
            <div className="scrubber-fill" style={{ width: `${playbackPct}%` }} />
          </div>

          {/* Duration */}
          <span
            className="text-[10px] font-mono w-16 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            {formatTime(trackLength)}
          </span>
        </div>
      )}

      {/* ── Scrollable track area ─────────────────────────────── */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ borderRadius: "4px" }}
      >
        <div style={{ width: `${100 * zoom}%`, minWidth: "100%" }}>
          {/* Time ruler */}
          <div
            className="relative h-5 mb-px"
            style={{
              marginLeft: "80px",
              borderBottom: "1px solid var(--border-hard)",
            }}
          >
            {timeMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute flex flex-col items-center"
                style={{ left: `${m.pct}%`, transform: "translateX(-50%)" }}
              >
                <span
                  className="text-[9px] font-mono leading-none"
                  style={{
                    color: m.major ? "var(--text-secondary)" : "var(--text-muted)",
                  }}
                >
                  {m.label}
                </span>
                <div
                  className="mt-0.5"
                  style={{
                    width: "1px",
                    height: m.major ? "6px" : "3px",
                    background: m.major ? "var(--text-muted)" : "var(--border-hard)",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div
            ref={trackAreaRef}
            className="flex flex-col gap-1 relative"
            style={{ marginLeft: "80px" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Hover cursor line (only when not playing) */}
            {cursorTime !== null && !isPlaying && (
              <div className="playhead" style={{ left: `${(cursorTime / trackLength) * 100}%` }}>
                <div
                  className="absolute font-mono text-[9px] px-1 py-0.5 rounded-sm"
                  style={{
                    top: "-18px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--accent)",
                    color: "#000",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTime(cursorTime)}
                </div>
              </div>
            )}

            {/* Playback playhead (green, during playback) */}
            {(isPlaying || playbackTime > 0) && (
              <div
                className="playhead-transport"
                style={{ left: `${playbackPct}%` }}
              />
            )}

            {LANES.map((lane) => {
              const hits = hitsByLane[lane.key];
              return (
                <div key={lane.key} className="flex items-stretch gap-0">
                  {/* Label */}
                  <div
                    className="w-0 shrink-0 flex items-center"
                    style={{ marginLeft: "-80px", width: "76px" }}
                  >
                    <span
                      className="text-[10px] font-mono font-bold tracking-widest w-full text-right pr-3"
                      style={{ color: `var(--${lane.key}-color)` }}
                    >
                      {lane.label}
                    </span>
                  </div>

                  {/* Lane track */}
                  <div className="lane flex-1">
                    <div className="lane-grid" style={{ backgroundSize: `${gridBgSize} 100%` }} />

                    {hits.map((hit, idx) => {
                      const pct = (hit.time / trackLength) * 100;
                      const opacity = 0.2 + hit.confidence * 0.8;
                      const heightPct = Math.max(20, hit.confidence * 100);
                      const hitId = `${lane.key}-${timeline.indexOf(hit)}`;
                      const isActive = activeHits.has(hitId);
                      return (
                        <div
                          key={`${lane.key}-${idx}`}
                          className={`hit-block ${lane.key}${isActive ? " hit-active" : ""}`}
                          style={{ 
                            left: `${pct}%`, 
                            opacity: isActive ? 1 : opacity,
                            height: `${heightPct}%`
                          }}
                        >
                          <div className="hit-tooltip">
                            {hit.instrument} · {formatTime(hit.time)} ·{" "}
                            {(hit.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}

                    {hits.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
                          —
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom tick marks */}
          <div
            className="relative h-2 mt-px"
            style={{
              marginLeft: "80px",
              borderTop: "1px solid var(--border-hard)",
            }}
          >
            {timeMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${m.pct}%`,
                  width: "1px",
                  height: m.major ? "5px" : "3px",
                  background: m.major ? "var(--text-muted)" : "var(--border-hard)",
                  transform: "translateX(-50%)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer hints ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-3 px-1">
        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
          hover for details · opacity = confidence
        </span>
        <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
          {audioUrl ? "space = play/pause · " : ""}scroll to pan · [+][-] to zoom
        </span>
      </div>
    </div>
  );
}

/* eslint-disable react-refresh/only-export-components -- shared animation utilities: hook + components intentionally co-located */
import { useEffect, useState, type ReactNode } from 'react';
import { SPAWN_DURATION, ANIMATION_MS } from './animationConstants';

/** Shared play/pause/reduced-motion state for all RLM-style animations. */
export function useAnimationPlayer() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduceMotion(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => setIsPlaying(false), ANIMATION_MS + 100);
    return () => window.clearTimeout(timer);
  }, [isPlaying, playKey]);

  const onPlay = () => {
    if (reduceMotion) return;
    setHasPlayed(true);
    setPlayKey((v) => v + 1);
    setIsPlaying(true);
  };

  return { reduceMotion, isPlaying, hasPlayed, playKey, onPlay };
}

interface SpawnPathProps {
  d: string;
  timing?: string;
  reduceMotion: boolean;
  animate: boolean;
}

/** Flow-line that draws itself on during the animation (stroke-dashoffset reveal). */
export function SpawnPath({ d, timing = '0;0.1;0.22;1', reduceMotion, animate }: SpawnPathProps) {
  if (reduceMotion || !animate) {
    return <path className="rlm-arch-line" d={d} />;
  }
  return (
    <path className="rlm-arch-line rlm-arch-line-spawn" d={d} pathLength={100}>
      <animate attributeName="stroke-dashoffset" values="100;100;0;0" keyTimes={timing} dur={SPAWN_DURATION} repeatCount="1" />
      <animate attributeName="opacity" values="0;0;1;1" keyTimes={timing} dur={SPAWN_DURATION} repeatCount="1" />
    </path>
  );
}

interface SpawnGroupProps {
  timing: string;
  reduceMotion: boolean;
  animate: boolean;
  /** Approximate center of the spawning group (for scale-from-root effect). */
  cx: number;
  cy: number;
  /** Root LM center that the group spawns from. */
  rootCx: number;
  rootCy: number;
  children: ReactNode;
}

/** Group that scales from the root LM position outward (like RLM subtrees). */
export function SpawnGroup({ timing, reduceMotion, animate, cx, cy, rootCx, rootCy, children }: SpawnGroupProps) {
  const scale = 0.12;
  const tx = rootCx - scale * cx;
  const ty = rootCy - scale * cy;

  return (
    <g className="rlm-subtree">
      {!reduceMotion && animate && (
        <>
          <animate attributeName="opacity" values="0;0;1;1" keyTimes={timing} dur={SPAWN_DURATION} repeatCount="1" />
          <animateTransform
            attributeName="transform"
            type="matrix"
            values={`${scale} 0 0 ${scale} ${tx.toFixed(1)} ${ty.toFixed(1)};${scale} 0 0 ${scale} ${tx.toFixed(1)} ${ty.toFixed(1)};1 0 0 1 0 0;1 0 0 1 0 0`}
            keyTimes={timing}
            dur={SPAWN_DURATION}
            repeatCount="1"
          />
        </>
      )}
      {children}
    </g>
  );
}

interface AnimationCardProps {
  title: string;
  subtitle: string;
  playingClassName: string;
  isPlaying: boolean;
  hasPlayed: boolean;
  reduceMotion: boolean;
  onPlay: () => void;
  children: ReactNode;
  footnote?: string;
}

/** Outer card chrome shared by all RLM-derived animations. */
export function AnimationCard({
  title,
  subtitle,
  playingClassName,
  isPlaying,
  hasPlayed,
  reduceMotion,
  onPlay,
  children,
  footnote,
}: AnimationCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || reduceMotion}
          className={`shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
            isPlaying
              ? playingClassName
              : reduceMotion
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
          }`}
          aria-label={`Play ${title} animation`}
          title={reduceMotion ? 'Animation disabled because Reduced Motion is enabled' : 'Play animation'}
        >
          <span className="text-sm leading-none">{isPlaying ? '\u23F5' : '\u25B6'}</span>
          <span>{isPlaying ? 'Playing...' : hasPlayed ? 'Replay' : 'Play'}</span>
        </button>
      </div>
      {children}
      {footnote && <p className="text-xs text-gray-500 mt-3">{footnote}</p>}
    </div>
  );
}

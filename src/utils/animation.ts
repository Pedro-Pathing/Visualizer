type AnimationState = {
  playing: boolean;
  percent: number;
  accumulatedSeconds: number;
  lastTimestamp: number | null;
  animationFrameId: number | null;
  totalDuration: number;
  loop: boolean;
};

/**
 * Create an animation controller for the robot simulation
 */
export function createAnimationController(
  totalDuration: number,
  onPercentChange: (percent: number) => void,
  onComplete?: () => void,
) {
  const state: AnimationState = {
    playing: false,
    percent: 0,
    accumulatedSeconds: 0, // total elapsed seconds (not tied to a single startTime)
    lastTimestamp: null, // last rAF timestamp seen while playing
    animationFrameId: null,
    totalDuration,
    loop: true,
  };

  let isExternalChange = false;

  function updatePercentFromAccumulated() {
    if (state.totalDuration > 0) {
      const rawPercent = (state.accumulatedSeconds / state.totalDuration) * 100;
      // clamp between 0 and 100 for non-looping; for looping we'll handle wrapping separately
      state.percent = Math.max(0, Math.min(100, rawPercent));
    } else {
      state.percent = 0;
    }
  }

  function animate(timestamp: number) {
    // If we aren't playing anymore, ensure we don't schedule anything further.
    if (!state.playing) {
      state.lastTimestamp = null;
      state.animationFrameId = null;
      return;
    }

    // Initialize lastTimestamp on first tick after play
    if (state.lastTimestamp === null) {
      state.lastTimestamp = timestamp;
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    // Compute delta time since last frame (in seconds)
    const deltaSeconds = (timestamp - state.lastTimestamp) / 1000;
    state.lastTimestamp = timestamp;

    // Advance accumulated time
    state.accumulatedSeconds += deltaSeconds;

    if (state.totalDuration > 0) {
      if (state.loop) {
        // For looping, wrap accumulatedSeconds so it doesn't grow unbounded.
        // Use modulo to allow continuous time even for large deltas.
        state.accumulatedSeconds =
          state.accumulatedSeconds % state.totalDuration;
        updatePercentFromAccumulated();
        if (!isExternalChange) onPercentChange(state.percent);
        // keep animating
        state.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Not looping: clamp to duration and stop when done
        if (state.accumulatedSeconds >= state.totalDuration) {
          state.accumulatedSeconds = state.totalDuration;
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(100);
          state.playing = false;
          state.lastTimestamp = null;
          if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = null;
          }
          if (onComplete) onComplete();
          return;
        } else {
          updatePercentFromAccumulated();
          if (!isExternalChange) onPercentChange(state.percent);
          state.animationFrameId = requestAnimationFrame(animate);
        }
      }
    } else {
      // duration is zero or invalid
      state.percent = 0;
      if (!isExternalChange) onPercentChange(state.percent);
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function play() {
    // If already playing, nothing to do
    if (state.playing) return;

    // If at the very end and not looping, reset to start so play restarts
    if (
      !state.loop &&
      state.totalDuration > 0 &&
      state.accumulatedSeconds >= state.totalDuration
    ) {
      state.accumulatedSeconds = 0;
      state.percent = 0;
      if (!isExternalChange) onPercentChange(0);
    }

    state.playing = true;
    // schedule the loop if not already scheduled
    if (state.animationFrameId === null) {
      state.lastTimestamp = null; // ensure animate initializes its timestamp properly
      state.animationFrameId = requestAnimationFrame(animate);
    }
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    // cancel outstanding rAF if any
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
    state.lastTimestamp = null;
  }

  function reset() {
    state.accumulatedSeconds = 0;
    state.percent = 0;
    state.lastTimestamp = null;
    if (!isExternalChange) onPercentChange(0);
  }

  return {
    play,
    pause,
    reset() {
      pause();
      reset();
    },
    seekToPercent(targetPercent: number) {
      isExternalChange = true;
      const clamped = Math.max(0, Math.min(100, targetPercent));
      if (state.totalDuration > 0) {
        state.accumulatedSeconds = (clamped / 100) * state.totalDuration;
      } else {
        state.accumulatedSeconds = 0;
      }
      updatePercentFromAccumulated();
      onPercentChange(clamped);

      // If playing, we keep animating; lastTimestamp will sync on next tick
      // Clear the external flag immediately so normal anim ticks resume updating.
      // Use setTimeout(..., 0) so this call does not interrupt the current stack where this may be called
      setTimeout(() => {
        isExternalChange = false;
      }, 0);
    },
    setDuration(duration: number) {
      // If duration changes, keep current progress proportionally if possible
      const oldDuration = state.totalDuration;
      if (oldDuration > 0) {
        const progress = state.accumulatedSeconds / oldDuration;
        state.totalDuration = duration;
        state.accumulatedSeconds = progress * Math.max(0, duration);
      } else {
        state.totalDuration = duration;
        state.accumulatedSeconds = Math.min(
          state.accumulatedSeconds,
          Math.max(0, duration),
        );
      }
      updatePercentFromAccumulated();
      if (!isExternalChange) onPercentChange(state.percent);
    },
    setLoop(loop: boolean) {
      state.loop = loop;
    },
    isPlaying() {
      return state.playing;
    },
    getPercent() {
      updatePercentFromAccumulated();
      return state.percent;
    },
    getDuration() {
      return state.totalDuration;
    },
    isLooping() {
      return state.loop;
    },
  };
}

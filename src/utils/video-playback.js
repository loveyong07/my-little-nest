export function readVideoPlayback(player) {
  if (!player) return null;
  return {
    currentTime: Number.isFinite(player.currentTime) ? Math.max(0, player.currentTime) : 0,
    paused: player.paused || player.ended,
    muted: player.muted,
    volume: player.volume,
    playbackRate: player.playbackRate,
  };
}

export function restoreVideoPlayback(player, state) {
  if (!player || !state) return;
  player.muted = state.muted;
  player.volume = state.volume;
  player.playbackRate = state.playbackRate;
  // A reader can open the enlarged player before the inline preload="none"
  // player has ever loaded. Restore that cold player when metadata arrives too.
  if (player.readyState < 1) {
    player.addEventListener("loadedmetadata", () => restoreVideoPlayback(player, state), { once: true });
    player.load();
    return;
  }
  const end = Number.isFinite(player.duration) ? player.duration : Infinity;
  player.currentTime = Math.min(Math.max(0, state.currentTime), end);
  if (state.paused) player.pause();
  else
    player.play()?.catch(() => {
      // A browser may require another gesture after switching players. Keep the
      // restored position and native play control usable in that case.
    });
}

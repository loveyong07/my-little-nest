// Self-hosted piano arrangement by Uno; source notes accompany the MP3.
export const MUSIC_SRC = "/assets/audio/air-tori-no-uta-piano-uno.mp3";
export function createNestAudio(AudioClass) {
  const audio = new AudioClass(MUSIC_SRC);
  audio.preload = "none";
  audio.loop = true;
  audio.volume = 0.6;
  return {
    async play(automatic = false) {
      try {
        await audio.play();
        return !audio.paused;
      } catch (error) {
        if (automatic && error.name === "NotAllowedError") return false;
        throw error;
      }
    },
    async pause() {
      audio.pause();
    },
    volume(value) {
      audio.volume = Math.max(0, Math.min(1, value));
    },
    close() {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}

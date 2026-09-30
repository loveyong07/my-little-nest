// A small original pentatonic melody synthesized locally.
// Autoplay respects browser policy; no audio download or microphone access.
export function createNestAudio(AudioContextClass) {
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = .22; master.connect(context.destination);
  const melody = [72, 76, 79, 81, 79, 76, 74, 0, 72, 74, 76, 79, 76, 74, 72, 0,
    69, 72, 76, 79, 76, 72, 74, 0, 67, 72, 74, 76, 74, 72, 67, 0];
  let next = 0, index = 0, timer;
  function note(midi, time, duration, volume) {
    if (!midi) return;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + .025);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain); gain.connect(master);
    oscillator.start(time); oscillator.stop(time + duration + .03);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function schedule() {
    while (next < context.currentTime + .3) {
      note(melody[index % melody.length], next, 1.6, .19);
      if (index % 8 === 0) {
        const bass = [48, 53, 57, 55][Math.floor(index / 8) % 4];
        note(bass, next, 3.6, .15); note(bass + 7, next + .1, 3.4, .075);
      }
      index++; next += .46;
    }
  }
  return {
    async play(automatic = false) {
      const resume = context.resume();
      if (automatic) {
        await Promise.race([resume, new Promise(resolve => setTimeout(resolve, 400))]);
        if (context.state !== "running") return false;
      } else await resume;
      next = context.currentTime + .06;
      schedule(); clearInterval(timer); timer = setInterval(schedule, 160);
      return true;
    },
    async pause() { clearInterval(timer); await context.suspend(); },
    volume(value) { master.gain.setTargetAtTime(value, context.currentTime, .05); },
    close() { clearInterval(timer); void context.close(); },
  };
}

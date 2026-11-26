import {reminderTones} from './plan-reminders.js';

let context;

export function prepareReminderSound() {
  if (!globalThis.AudioContext) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch {
    // The system notification can still alert when browser audio is unavailable.
  }
}

export function signalReminder(tone = 'rise', vibrate = true) {
  if (vibrate) navigator.vibrate?.([250, 100, 250, 100, 400]);
  if (context?.state !== 'running') return;

  const tones = reminderTones[tone] || reminderTones.rise;
  const start = context.currentTime;
  for (const [index, frequency] of tones.entries()) {
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const when = start + index * 0.23;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0, when);
    volume.gain.linearRampToValueAtTime(0.15, when + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(when);
    oscillator.stop(when + 0.21);
    oscillator.onended = () => {
      oscillator.disconnect();
      volume.disconnect();
    };
  }
}

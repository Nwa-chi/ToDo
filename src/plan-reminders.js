export const reminderTones = {
  rise: [659.25, 783.99, 987.77],
  bell: [987.77, 659.25, 987.77],
  pulse: [523.25, 523.25, 783.99, 783.99],
  steps: [392, 523.25, 659.25, 523.25],
  fall: [880, 698.46, 523.25],
  signal: [587.33, 880, 587.33, 880]
};

const toneNames = Object.keys(reminderTones);
export const reminderLeadDays = [1, 2, 3, 7];

export function planTone(plan) {
  if (toneNames.includes(plan?.reminder_tone)) return plan.reminder_tone;
  let hash = 0;
  for (const letter of plan?.id || '') hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return toneNames[hash % toneNames.length];
}

export function localDateTime(value) {
  const date = new Date(value);
  const part = number => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + part(date.getMonth() + 1) + '-' + part(date.getDate())
    + 'T' + part(date.getHours()) + ':' + part(date.getMinutes());
}

export function advanceReminder(start, selection, custom) {
  if (!selection) return {advance_reminder_at:null, reminder_lead_days:null};
  if (!start) throw Error('Choose a start date before setting an advance reminder.');
  const startTime = new Date(start);
  let date;
  let days = null;
  if (selection === 'custom') {
    date = new Date(custom);
    if (!custom || !Number.isFinite(date.getTime()) || localDateTime(date) !== custom) {
      throw Error('Choose a valid date and time for the custom reminder.');
    }
  } else {
    days = Number(selection);
    if (!reminderLeadDays.includes(days)) throw Error('Choose a valid reminder interval.');
    date = new Date(startTime);
    date.setDate(date.getDate() - days);
  }
  if (date >= startTime) throw Error('The advance reminder must be before the plan starts.');
  return {advance_reminder_at:date.toISOString(), reminder_lead_days:days};
}

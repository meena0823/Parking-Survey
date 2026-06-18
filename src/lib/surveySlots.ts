export interface GeneratedSlot {
  slot_number: number;
  start_time: string;
  end_time: string;
  /** Minutes of planned break after this slot (0 for the last slot). */
  break_after_minutes: number;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

export function formatTimeLabel(time: string): string {
  return time.slice(0, 5);
}

export function getSurveyDurationMinutes(startTime: string, endTime: string): number {
  let startMinutes = parseTimeToMinutes(startTime);
  let endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

export function getSurveyDurationHours(startTime: string, endTime: string): number {
  const durationMinutes = getSurveyDurationMinutes(startTime, endTime);
  return Math.max(1, Math.ceil(durationMinutes / 60));
}

export function isValidSurveyWindow(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  return getSurveyDurationMinutes(startTime, endTime) > 0;
}

export function generateSurveySlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number,
  graceMinutes = 0
): GeneratedSlot[] {
  if (!startTime || !endTime || intervalMinutes <= 0) return [];

  let startMinutes = parseTimeToMinutes(startTime);
  let endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const slots: GeneratedSlot[] = [];
  let current = startMinutes;
  let slotNumber = 1;

  while (current < endMinutes) {
    const slotEnd = Math.min(current + intervalMinutes, endMinutes);
    slots.push({
      slot_number: slotNumber,
      start_time: minutesToTimeString(current),
      end_time: minutesToTimeString(slotEnd),
      break_after_minutes: graceMinutes,
    });
    current = slotEnd + Math.max(0, graceMinutes);
    slotNumber += 1;
  }

  // Last slot has no break after it
  if (slots.length > 0) {
    slots[slots.length - 1].break_after_minutes = 0;
  }

  return slots;
}

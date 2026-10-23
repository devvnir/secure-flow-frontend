export const SOURCE_TYPES = ['RESO', 'CSV', 'API', 'Database', 'S3'];
export const DESTINATION_TYPES = ['Database', 'API', 'CSV', 'S3'];
export const RESO_RESOURCES = ['Property', 'Agent', 'Office', 'Contact'];

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const units: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [2592000, 'month'], [31536000, 'year']];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (let i = units.length - 1; i >= 0; i--) {
    const [size, unit] = units[i];
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return rtf.format(-Math.max(1, Math.floor(seconds / 60)), 'minute');
}

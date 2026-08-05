const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

function split(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return { value: 0, unit: 'B' };
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1);
  return { value: n / 1024 ** i, unit: UNITS[i] };
}

/** Two-decimal form used in tables and detail views: "1.25 MB". */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '—';
  if (Number(bytes) === 0) return '0 B';
  const { value, unit } = split(bytes);
  return `${value.toFixed(unit === 'B' ? 0 : 2)} ${unit}`;
};

/** Tighter form for meters and chips: "1.3 MB", "12 GB". */
export const formatCompactBytes = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '—';
  if (Number(bytes) === 0) return '0 B';
  const { value, unit } = split(bytes);
  const digits = unit === 'B' ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
};

/** Thousands-separated counts: "1,204,551". */
export const formatCount = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString();
};

export default formatFileSize;

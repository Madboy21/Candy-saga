// Utilities to handle "today" by Asia/Dhaka (+06:00)
export function dhakaNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 6 * 60 * 60000);
}
export function dhakaStamp(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const dhaka = new Date(utcMs + 6 * 60 * 60000);
  const y = dhaka.getFullYear();
  const m = String(dhaka.getMonth() + 1).padStart(2, '0');
  const d = String(dhaka.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

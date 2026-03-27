import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function parseErrorDetail(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
  }
  return String(detail);
}

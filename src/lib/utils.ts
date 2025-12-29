import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const IGNORE_PATHS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/__snapshots__/**",

  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.svg",
  "**/*.webp",
  "**/*.pdf",

  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",

  "**/*.min.css",
  "**/*.css.map",

  "**/.env*",

  "**/*.test.*",
  "**/*.spec.*",

  "**/.github/**",
];
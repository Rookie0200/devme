import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const IGNORE_PATHS = [
  // Build & Dependencies
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/__snapshots__/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/.vercel/**",

  // Images & Media
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.svg",
  "**/*.webp",
  "**/*.pdf",
  "**/*.ico",
  "**/*.icns",
  "**/*.mp3",
  "**/*.mp4",
  "**/*.woff",
  "**/*.woff2",
  "**/*.ttf",
  "**/*.eot",
  "**/*.otf",

  // Lock files
  "**/*.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/composer.lock",
  "**/Gemfile.lock",

  // Minified & Generated
  "**/*.min.js",
  "**/*.min.css",
  "**/*.bundle.js",
  "**/*.css.map",
  "**/*.js.map",
  "**/*.chunk.js",

  // Config files (low value for code understanding)
  "**/.env*",
  "**/.eslintrc*",
  "**/.prettierrc*",
  "**/prettier.config.*",
  "**/eslint.config.*",
  "**/tsconfig*.json",
  "**/jsconfig*.json",
  "**/.editorconfig",
  "**/.gitignore",
  "**/.gitattributes",
  "**/.npmrc",
  "**/.nvmrc",
  "**/.node-version",
  "**/postcss.config.*",
  "**/tailwind.config.*",
  "**/next.config.*",
  "**/vite.config.*",
  "**/webpack.config.*",
  "**/babel.config.*",
  "**/.babelrc*",
  "**/jest.config.*",
  "**/vitest.config.*",
  "**/components.json",
  "**/vercel.json",
  "**/netlify.toml",
  "**/docker-compose*.yml",
  "**/Dockerfile*",
  "**/*.dockerfile",
  "**/Makefile",

  // Documentation (not useful for code context)
  "**/*.md",
  "**/LICENSE*",
  "**/CHANGELOG*",
  "**/CONTRIBUTING*",
  "**/CODE_OF_CONDUCT*",
  "**/AUTHORS*",
  "**/HISTORY*",

  // Tests
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/test/**",
  "**/tests/**",
  "**/fixtures/**",
  "**/*.stories.*",
  "**/*.story.*",

  // Type declarations (generated, minimal logic)
  "**/*.d.ts",
  "**/types/**/*.d.ts",

  // Database migrations (raw SQL, not app logic)
  "**/migrations/**",
  "**/prisma/migrations/**",
  "**/drizzle/migrations/**",
  "**/*.sql",

  // IDE & Editor configs
  "**/.vscode/**",
  "**/.idea/**",
  "**/*.code-workspace",

  // CI/CD
  "**/.github/**",
  "**/.gitlab-ci.yml",
  "**/.circleci/**",
  "**/.travis.yml",
  "**/azure-pipelines.yml",
  "**/.drone.yml",
  "**/Jenkinsfile",

  // Package manager metadata
  "**/package.json",
  "**/composer.json",
  "**/Cargo.toml",
  "**/Gemfile",
  "**/requirements.txt",
  "**/pyproject.toml",
  "**/go.mod",
  "**/go.sum",

  // Scripts & Shell (usually deployment, not app logic)
  "**/scripts/**",
  "**/*.sh",
  "**/*.bash",
  "**/*.ps1",
  "**/*.bat",
  "**/*.cmd",
];

/**
 * File extensions that contain actual code worth summarizing.
 * Used for secondary filtering after IGNORE_PATHS.
 */
export const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyw",
  ".java", ".kt", ".kts", ".scala",
  ".go",
  ".rs",
  ".rb", ".erb",
  ".php",
  ".cs", ".fs",
  ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp",
  ".swift",
  ".vue", ".svelte",
  ".astro",
  ".graphql", ".gql",
]);

/**
 * Minimum content length to be worth summarizing.
 * Very short files are usually re-exports or stubs.
 */
export const MIN_CONTENT_LENGTH = 100;

/**
 * Maximum file size to process (skip huge generated files).
 */
export const MAX_CONTENT_LENGTH = 50000;

/**
 * Check if a file should be processed for embeddings.
 */
export function shouldProcessFile(filePath: string, content: string): boolean {
  // Check extension
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) {
    return false;
  }

  // Check content length
  const len = content.length;
  if (len < MIN_CONTENT_LENGTH || len > MAX_CONTENT_LENGTH) {
    return false;
  }

  // Skip files that are mostly imports/exports (low logic density)
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const importExportLines = lines.filter(
    (l) => /^(import|export|from|require)\b/.test(l.trim())
  ).length;
  if (lines.length > 0 && importExportLines / lines.length > 0.7) {
    return false; // >70% imports/exports = barrel file or re-export
  }

  return true;
}
/**
 * Extracts the file name from a git diff chunk.
 * Parses the "a/file.ts b/file.ts" format from diff headers.
 *
 * @param fileDiff - A single file's diff content (without the "diff --git " prefix)
 * @returns The extracted file name, or 'unknown' if parsing fails
 */
export function extractFileName(fileDiff: string): string {
  // Match pattern: "a/path/to/file.ts b/path/to/file.ts"
  const match = fileDiff.match(/^a\/(.+?)\s+b\//);
  if (match) {
    return match[1];
  }

  // Fallback: try to get from +++ line
  const plusMatch = fileDiff.match(/\+\+\+ b\/(.+)/);
  if (plusMatch) {
    return plusMatch[1];
  }

  return 'unknown';
}

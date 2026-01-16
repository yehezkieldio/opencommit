/**
 * Extracts the file name from a git diff chunk.
 * Parses the "a/file.ts b/file.ts" format from diff headers.
 *
 * @param fileDiff - A single file's diff content (without the "diff --git " prefix)
 * @returns The extracted file name, or 'unknown' if parsing fails
 */
const DIFF_FILE_REGEX = /^a\/(.+?)\s+b\//;
const FALLBACK_REGEX = /\+\+\+ b\/(.+)/;

export function extractFileName(fileDiff: string): string {
    // Match pattern: "a/path/to/file.ts b/path/to/file.ts"
    const match = fileDiff.match(DIFF_FILE_REGEX);
    if (match) {
        return match?.[1] ?? "unknown";
    }

    // Fallback: try to get from +++ line
    const plusMatch = fileDiff.match(FALLBACK_REGEX);
    if (plusMatch) {
        return plusMatch?.[1] ?? "unknown";
    }

    return "unknown";
}

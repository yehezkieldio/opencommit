const CONVENTIONAL_COMMIT_REGEX = /^(fix|feat)\((.+?)\):/;

export function removeConventionalCommitWord(message: string): string {
    return message.replace(CONVENTIONAL_COMMIT_REGEX, "($2):");
}

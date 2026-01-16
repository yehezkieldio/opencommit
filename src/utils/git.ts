import { readFileSync } from "node:fs";
import { join } from "node:path";
import { outro, spinner } from "@clack/prompts";
import { execa } from "execa";
import ignore, { type Ignore } from "ignore";

export const assertGitRepo = async () => {
    try {
        await execa("git", ["rev-parse"]);
    } catch (error) {
        throw new Error(error as string);
    }
};

export const getOpenCommitIgnore = async (): Promise<Ignore> => {
    const gitDir = await getGitDir();

    // biome-ignore lint/suspicious/noExplicitAny: ignore type definition mismatch
    const ig = (ignore as any)();

    try {
        ig.add(readFileSync(join(gitDir, ".opencommitignore")).toString().split("\n"));
    } catch (e) {}

    return ig;
};

export const getCoreHooksPath = async (): Promise<string> => {
    const gitDir = await getGitDir();

    const { stdout } = await execa("git", ["config", "core.hooksPath"], {
        cwd: gitDir,
    });

    return stdout;
};

export const getStagedFiles = async (): Promise<string[]> => {
    const gitDir = await getGitDir();

    const { stdout: files } = await execa("git", ["diff", "--name-only", "--cached", "--relative"], { cwd: gitDir });

    if (!files) return [];

    const filesList = files.split("\n");

    const ig = await getOpenCommitIgnore();
    const allowedFiles = filesList.filter((file) => !ig.ignores(file));

    if (!allowedFiles) return [];

    return allowedFiles.sort();
};

export const getChangedFiles = async (): Promise<string[]> => {
    const gitDir = await getGitDir();

    const { stdout: modified } = await execa("git", ["ls-files", "--modified"], {
        cwd: gitDir,
    });

    const { stdout: others } = await execa("git", ["ls-files", "--others", "--exclude-standard"], { cwd: gitDir });

    const files = [...modified.split("\n"), ...others.split("\n")].filter((file) => !!file);

    return files.sort();
};

export const gitAdd = async ({ files }: { files: string[] }) => {
    const gitDir = await getGitDir();

    const gitAddSpinner = spinner();

    gitAddSpinner.start("Adding files to commit");

    await execa("git", ["add", ...files], { cwd: gitDir });

    gitAddSpinner.stop(`Staged ${files.length} files`);
};

export const getDiff = async ({ files }: { files: string[] }) => {
    const gitDir = await getGitDir();

    const isIgnored = (file: string) =>
        file.endsWith("package-lock.json") ||
        file.endsWith("yarn.lock") ||
        file.endsWith("pnpm-lock.yaml") ||
        file.endsWith("bun.lock") ||
        file.endsWith(".svg") ||
        file.endsWith(".png") ||
        file.endsWith(".jpg") ||
        file.endsWith(".jpeg") ||
        file.endsWith(".webp") ||
        file.endsWith(".gif") ||
        file.endsWith(".ico") ||
        file.endsWith(".min.js") ||
        file.endsWith(".min.css");

    const ignoredFiles = files.filter(isIgnored);
    const targetFiles = files.filter((f) => !isIgnored(f));

    if (targetFiles.length === 0) {
        if (ignoredFiles.length > 0) {
            return `No code changes detected. The following binary/lock files were modified:\n${ignoredFiles.join("\n")}`;
        }
        return "";
    }

    const { stdout: diff } = await execa("git", ["diff", "--staged", "--diff-filter=ACMR", "--", ...targetFiles], {
        cwd: gitDir,
    });

    let finalOutput = diff;
    if (ignoredFiles.length > 0) {
        finalOutput += `\n\n[NOTE] The following files were also modified but excluded from the diff to save space:\n${ignoredFiles.join("\n")}`;
        outro(`Excluded ${ignoredFiles.length} binary/lock files from AI context.`);
    }

    return finalOutput;
};

export const getGitDir = async (): Promise<string> => {
    const { stdout: gitDir } = await execa("git", ["rev-parse", "--show-toplevel"]);

    return gitDir;
};

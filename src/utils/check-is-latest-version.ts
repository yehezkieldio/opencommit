import { outro } from "@clack/prompts";
import chalk from "chalk";

import packageJSON from "../../package.json" with { type: "json" };
import { getOpenCommitLatestVersion } from "../version.js";

export const checkIsLatestVersion = async () => {
    const latestVersion = await getOpenCommitLatestVersion();

    if (latestVersion) {
        const currentVersion = packageJSON.version;

        if (currentVersion !== latestVersion) {
            outro(
                chalk.yellow(
                    `
You are not using the latest stable version of OpenCommit with new features and bug fixes.
Current version: ${currentVersion}. Latest version: ${latestVersion}.
🚀 To update run: npm i - g opencommit @latest.
        `
                )
            );
        }
    }
};

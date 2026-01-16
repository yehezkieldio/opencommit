export const COMMANDS = {
    config: "config",
} as const;

export type COMMANDS = (typeof COMMANDS)[keyof typeof COMMANDS];

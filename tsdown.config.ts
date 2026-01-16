import { defineConfig } from "tsdown/config";

export default defineConfig([
    {
        entry: "./src/cli.ts",
        platform: "neutral",
        nodeProtocol: "strip",
        minify: false,
        outDir: "./out",
        hooks(hooks) {
            hooks.hook("build:done", async () => {
                const wasm = Bun.file("./node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm");
                await Bun.write("./out/tiktoken_bg.wasm", wasm);
            });
        },
    },
]);

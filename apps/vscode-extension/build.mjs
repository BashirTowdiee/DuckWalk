import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  logLevel: "info",
  sourcemap: true
};

const extensionConfig = {
  ...shared,
  entryPoints: ["src/extension.ts"],
  external: ["vscode"],
  format: "cjs",
  outfile: "dist/extension.js",
  platform: "node",
  target: "node18"
};

const webviewConfig = {
  ...shared,
  define: {
    "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production")
  },
  entryPoints: ["src/sidebar/webview.tsx"],
  format: "iife",
  globalName: "DuckWalkSidebar",
  outfile: "dist/webview.js",
  platform: "browser",
  target: "es2020"
};

if (isWatch) {
  const extensionContext = await esbuild.context(extensionConfig);
  const webviewContext = await esbuild.context(webviewConfig);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log("[duckwalk-vscode-extension] watching");
} else {
  await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
}

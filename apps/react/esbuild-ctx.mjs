import * as esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";

export const ctx = await esbuild.context({
  entryPoints: ["./src/app.tsx"],
  bundle: true,
  sourcemap: true,
  outfile: "../../build/react/app.js",
  plugins: [
    copy({
      resolveFrom: "cwd",
      assets: {
        from: ["./src/epilog/plain-js/epilog.js"],
        to: ["../../build/react"],
      },
      watch: true,
    }),
  ],
});

import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        setup: resolve(__dirname, "setup.html"),
        claim: resolve(__dirname, "claim.html"),
      },
    },
  },
});

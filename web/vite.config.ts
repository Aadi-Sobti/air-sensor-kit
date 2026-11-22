import { resolve } from "node:path";

import { defineConfig } from "vite";

// Local preview only: the snapshot API comes from the Functions emulator (the Hosting emulator can't serve the
// map file, because it doesn't do HTTP range requests; real Firebase Hosting is checked after deploy).
const emulatorSnapshot = {
  "/api/v1/snapshot.json": { target: "http://127.0.0.1:5001", rewrite: () => "/demo-prosefire/us-east1/snapshot" },
};

export default defineConfig({
  preview: { proxy: emulatorSnapshot },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        setup: resolve(__dirname, "setup.html"),
        claim: resolve(__dirname, "claim.html"),
        sensor: resolve(__dirname, "s.html"),
        my: resolve(__dirname, "my.html"),
      },
    },
  },
});

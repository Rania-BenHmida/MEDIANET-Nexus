import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import fs from "node:fs";
import path from "node:path";

// mkcert-generated cert for the local dev domain — see setup notes for the
// one-time command to create these two files. Only read if present, so the
// app still runs over plain HTTP for anyone who hasn't set this up yet.
const certDir = path.resolve(process.cwd(), "certs");
const keyPath = path.join(certDir, "medianet-nexus.local-key.pem");
const certPath = path.join(certDir, "medianet-nexus.local.pem");
const hasCert = fs.existsSync(keyPath) && fs.existsSync(certPath);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 5173,
      strictPort: true,
      // Vite blocks unrecognized Host headers by default — add the custom
      // local hostname you map in your hosts file (see setup notes) so the
      // dev server accepts requests to it instead of only "localhost".
      allowedHosts: ["medianet-nexus.local"],
      ...(hasCert && {
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        },
      }),
    },
  },
});
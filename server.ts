import http from "node:http";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { APP_PORT } from "./src/lib/runtimeConfig";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
          clientPort: APP_PORT,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve static files from dist
    // When running as dist/server.cjs, __dirname will be dist/
    // When running as server.ts in production (unlikely but possible), it would be root
    const distPath = path.resolve(__dirname, process.env.NODE_ENV === "production" ? "." : "dist");
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(APP_PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${APP_PORT}`);
  });
}

startServer();

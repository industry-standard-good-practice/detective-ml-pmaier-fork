import express from "express";
import path from "path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";

/** Same folder as this file (frontend/). Vite must use this — not process.cwd() — or the wrong index.html may load. */
const FRONTEND_ROOT = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const HTTP_PORT = 3000;

  // Proxy endpoint to bypass CORS
  app.get("/api/proxy-image", async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("URL is required");
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return res.status(response.status).send("Failed to fetch image");
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/png";
      const base64 = Buffer.from(buffer).toString("base64");

      res.json({
        base64: `data:${contentType};base64,${base64}`,
        contentType
      });
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: FRONTEND_ROOT,
      configFile: path.join(FRONTEND_ROOT, "vite.config.ts"),
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(FRONTEND_ROOT, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(FRONTEND_ROOT, "dist", "index.html"));
    });
  }

  // HTTP server
  app.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${HTTP_PORT}`);
  });
}

startServer();

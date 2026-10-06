import { serve } from "bun";
import { join } from "path";

const dist = join(import.meta.dir, "dist");
const port = Number(process.env.PORT || 8080);

serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(dist, path);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }
    // SPA fallback
    return new Response(Bun.file(join(dist, "index.html")));
  },
});

console.log(`Olho no Lance web on :${port}`);

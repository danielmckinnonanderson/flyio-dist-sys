import "./node";

Bun.serve({
  fetch(req) {
    return new Response("Fuck you buddy!");
  }
});


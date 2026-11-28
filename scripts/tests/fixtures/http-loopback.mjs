import { once } from "node:events";
import { createServer } from "node:http";

export async function startHttpFixture(t, handle) {
  const server = createServer(handle);
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  t.after(async () => {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  });

  return `http://127.0.0.1:${server.address().port}`;
}

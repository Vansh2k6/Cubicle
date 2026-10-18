import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./api/server.js";
import { createStaticHandler } from "./static.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const { server } = createServer({ debug: false, staticHandler: createStaticHandler(join(root, "dist")) });
server.listen(port, "127.0.0.1", () => console.log(`Cubicle demo: http://127.0.0.1:${port}`));

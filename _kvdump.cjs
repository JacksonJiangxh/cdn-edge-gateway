const fs = require("fs");
const path = require("path");

const blobsDir = ".wrangler/state/v3/kv/local-dev-kv/blobs";
const files = fs.readdirSync(blobsDir);
for (const f of files) {
  const p = path.join(blobsDir, f);
  let content = "";
  try { content = fs.readFileSync(p, "utf8"); } catch (e) { continue; }
  // 只打印包含站点/源站关键字的
  const hit = content.includes("github") || content.includes("cnb") ||
    content.includes("repoUser") || content.includes("repoName") ||
    content.includes("static-resources") || content.includes("raw/") ||
    content.includes("engine") || content.includes("\"pool\"") ||
    content.includes("origin") || content.includes("hostHeader") ||
    content.includes("idnv749") || content.includes("msw1er0x");
  if (hit) {
    console.log("######## BLOB:", f);
    console.log(content.slice(0, 8000));
    console.log("\n");
  }
}

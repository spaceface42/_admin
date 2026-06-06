import { readFile, writeFile } from "node:fs/promises";

const htmlPath = new URL("./src/index.html", import.meta.url);
const cssPath = new URL("./src/admin.css", import.meta.url);
const jsPath = new URL("./src/admin.js", import.meta.url);
const outPath = new URL("./admin.html", import.meta.url);

const [html, css, jsRaw] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(cssPath, "utf8"),
  readFile(jsPath, "utf8")
]);

// Prevent literal closing script tags inside JavaScript strings/comments from
// terminating the inline script element in the built single-file admin.
const js = jsRaw.replaceAll("</script", "<\\/script");

const built = html
  .replace('<link rel="stylesheet" href="./admin.css">', () => `<style>\n${css.trim()}\n</style>`)
  .replace('<script src="./admin.js" defer></script>', () => `<script>\n${js.trim()}\n</script>`);

await writeFile(outPath, built + "\n", "utf8");

console.log("Built admin.html");

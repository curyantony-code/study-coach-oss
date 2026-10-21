// electron-builder leaves folders named node_modules out of "extra resources", and the app's
// server cannot run without its own. So the server is copied in whole after packaging.
const fs = require("fs");
const path = require("path");

/** Every symbolic link under `dir`. */
function linksUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [full];
    return entry.isDirectory() ? linksUnder(full) : [];
  });
}

exports.default = async function afterPack(context) {
  const from = path.join(context.packager.projectDir, ".next", "standalone");
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const to = path.join(resources, "server");
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  // The build links some packages (e.g. .next/node_modules/gray-matter-<hash>). A link would point at
  // this build machine's folders, which do not exist on anyone else's computer, so each one is
  // replaced by a real copy of what it points to. (cpSync's own dereference skips nested links.)
  for (const link of linksUnder(to)) {
    const target = fs.realpathSync(path.join(from, path.relative(to, link)));
    fs.rmSync(link, { force: true });
    fs.cpSync(target, link, { recursive: true, verbatimSymlinks: true });
  }
  if (!fs.existsSync(path.join(to, "node_modules", "next"))) throw new Error("The server's dependencies were not copied into the app.");
  const links = linksUnder(to);
  if (links.length > 0) throw new Error(`The packaged server still contains links that would break on other computers:\n${links.join("\n")}`);
};

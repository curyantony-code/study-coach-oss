// electron-builder leaves folders named node_modules out of "extra resources", and the app's
// server cannot run without its own. So the server is copied in whole after packaging.
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const from = path.join(context.packager.projectDir, ".next", "standalone");
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const to = path.join(resources, "server");
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  if (!fs.existsSync(path.join(to, "node_modules", "next"))) throw new Error("The server's dependencies were not copied into the app.");
};

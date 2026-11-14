"""Adapt the upstream release tarball; fail loudly if its expected API changes."""
import json
from pathlib import Path

package = Path("package.json")
data = json.loads(package.read_text())
# The release already contains the built UI. Its prepack script refers to the
# unpublished monorepo, and development dependencies are not needed at runtime.
data.pop("devDependencies", None)
data["scripts"] = {}
package.write_text(json.dumps(data, indent=2) + "\n")


def replace(filename, old, new):
    path = Path(filename)
    text = path.read_text()
    assert text.count(old) == 1, (filename, old)
    path.write_text(text.replace(old, new))


# Always use the packaged Node runtime, not a possibly incompatible user Bun.
replace("bin/cli.js", "return isBunInstalled() ? 'bun' : 'node';", "return 'node';")

# The Nix store is immutable: never run npm/pnpm/bun global self-updaters.
for signature in [
    "export function getUpdateCommand(pm = detectPackageManager()) {",
    "export function executeUpdate(pm = detectPackageManager(), options = {}) {",
]:
    replace("server/lib/package-manager.js", signature,
            signature + "\n  throw new Error('This installation is managed by Nix; update it through Nix.');")

# OpenCode is supplied separately on PATH/OPENCODE_BINARY, never downloaded by
# this package. Disable the upstream install and upgrade API entry points.
replace("server/lib/opencode/v2-install.js",
        "if (!supportsOpenCodeV2Install(platform)) throw new Error(",
        "throw new Error('Install OpenCode separately through Nix.');\n  if (!supportsOpenCodeV2Install(platform)) throw new Error(")
replace("server/lib/opencode/routes.js",
        "upgradeInFlight = upgradeOpenCodeCli().finally(() => { upgradeInFlight = null; });",
        "throw new Error('Upgrade OpenCode through Nix.');")

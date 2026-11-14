{ glances }:
# The pinned Glances web API pulls insecure python-jose (CVE-2026-120459).
# Keep the local terminal monitor, without shipping optional JWT authentication.
# No permittedInsecurePackages escape hatch is used.
glances.overridePythonAttrs (old: {
  pname = "glances-cli";
  dependencies = builtins.filter (p: (p.pname or "") != "python-jose") old.dependencies;
  meta = old.meta // {
    description = "Glances monitor without optional JWT authentication";
  };
})

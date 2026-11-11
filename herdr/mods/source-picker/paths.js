// Resolve an entered directory independently of the suggestion list.
export function resolvePath(value, home) {
  if (!value) throw new Error("Enter a directory path.");
  let path = value;
  if (path === "~") path = home;
  else if (path.startsWith("~/")) path = home + path.slice(1);
  else if (!path.startsWith("/")) path = `${home}/${path}`;
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  const folder = "/" + parts.join("/");
  const root = home.replace(/\/+$/, "") || "/";
  if (root !== "/" && folder !== root && !folder.startsWith(root + "/")) {
    throw new Error("Choose a directory inside your home (~).");
  }
  return folder;
}

// The last component filters suggestions; it is never an implicit selection.
export function parsePath(value, home) {
  let path = value;
  if (path === "~") path = "~/";
  if (path.startsWith("~/")) path = home + path.slice(1);
  else if (!path.startsWith("/")) path = `${home}/${path}`;
  const split = path.lastIndexOf("/");
  const folder = resolvePath(path.slice(0, split) || "/", home);
  const filter = path.slice(split + 1);
  if (filter === "." || filter === "..") return parsePath(path + "/", home);
  return { folder, filter };
}

export function matchingDirectories(names, filter) {
  const query = filter.toLowerCase();
  return names.filter((name) => name.toLowerCase().includes(query));
}

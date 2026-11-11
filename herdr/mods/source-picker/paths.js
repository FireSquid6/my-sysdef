// Interpret the last path component as the same substring filter as before.
export function parsePath(value, home) {
  let path = value;
  if (path === "~") path = "~/";
  if (path.startsWith("~/")) path = home + path.slice(1);
  else if (!path.startsWith("/")) path = `${home}/${path}`;
  const split = path.lastIndexOf("/");
  const parts = [];
  for (const part of path.slice(0, split).split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  const folder = "/" + parts.join("/");
  if (folder !== home && !folder.startsWith(home + "/")) {
    throw new Error("Choose a directory inside your home (~).");
  }
  const filter = path.slice(split + 1);
  if (filter === "." || filter === "..") return parsePath(path + "/", home);
  return { folder, filter };
}

export function matchingDirectories(names, filter) {
  const query = filter.toLowerCase();
  return names.filter((name) => name.toLowerCase().includes(query));
}

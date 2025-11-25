export type MenuOption = { label: string } & ({
  type: "function",
  fn: () => Promise<void>, 
} | {
  type: "shell",
  command: string[],
})


export async function runMenu(options: MenuOption[]) {
  const stdin = options.map(o => o.label).join("\n");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(stdin));
      controller.close();
    }
  });

  const process = Bun.spawn(["fuzzel", "-d"], {
    stdin: stream,
    stdout: "pipe",
  });
  await process.exited;

  const result = await process.stdout.text();
  const selected = result.trim();

  const option = options.find(o => o.label === selected);

  if (option === undefined) {
    errorOut(`Could not find option ${option}`);

  }

  switch (option.type) {
    case "shell":
      Bun.spawnSync(option.command);
      break;
  }
}


function errorOut(error: string): never {
  Bun.spawnSync(["notify-send", error]);
  process.exit(1);

}





export async function readline(): Promise<string> {
  for await (const line of console) {
    return line;
  }

  return "";
}

export async function promptForOk(prompt: string): Promise<void> {
  console.log(`${prompt} (y/N)`);
  const line = await readline();
  const ok = line === "y" || line === "Y";

  if (!ok) {
    console.log("Aborted.");
    process.exit(0);
  }
}

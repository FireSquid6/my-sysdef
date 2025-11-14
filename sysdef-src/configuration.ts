import YAML from "yaml";
import { v } from "./validation";
import path from "path";
import fs from "fs";
import { errorOut, getErrorMessage } from "./sysdef";


const configSchema = v.obj({
  providers: v.array(v.string()),
  modules: v.array(v.string()),
  variables: v.record(v.string(), v.string()),
});

export type Config = v.Infer<typeof configSchema>;


export function readConfig(rootDir: string): Config {
  try {
    const filepath = path.join(rootDir, "config.yaml");
    if (!fs.existsSync(filepath)) {
      throw new Error(`Configuration file that should be at ${filepath} not found`);
    }

    const text = fs.readFileSync(filepath).toString();
    const object = YAML.parse(text);
    console.log(object);
    const config = v.parse(object, configSchema);

    return config;


  } catch (e) {
    const err = getErrorMessage(e);
    errorOut(`Error reading the config file: ${err}`);
  }
}




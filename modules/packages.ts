// this file just loads all the files in the packagelist
import type { ModuleGenerator } from "../sysdef-src/sysdef";


const m: ModuleGenerator = () => {
  return {
    name: "packages",
    variables: {},
    files: {},
    directories: {},
  }
}


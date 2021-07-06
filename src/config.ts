import { Config } from "./types";
import * as fs from "fs";
import * as path from "path";

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config.json"), {
    encoding: "utf-8",
  })
);

export default config as Config;

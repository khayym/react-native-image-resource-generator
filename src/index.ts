#!/usr/bin/env node

import fs from "fs";
import {FileEntry} from "./FileEntry";
import path from "path";
import {cmdOptions, cmdUsage} from "./options";
import {IResourceEntries, Options} from "./types";
import {transliterate} from "transliteration";
import {OptionsTransliterate} from "transliteration/dist/node/src/types";

run()
  .then(() => console.log("Done"))
  .catch((error) => console.error(`Error happened while generating resources:\n${error}`));

async function run(): Promise<void> {
  checkOptions(cmdOptions);
  console.log(`Started searching resources in ${cmdOptions.dir}`);

  const resources: IResourceEntries[] = [];

  let content = `/* eslint:disable */\n/* tslint:disable */${cmdOptions.ts ? '\nimport {ImageURISource} from "react-native";' : ""}`;

  await prepareFiles(cmdOptions.dir);
  await collectEntries(cmdOptions.dir, path.join(path.dirname(cmdOptions.out), cmdOptions.read || ""), true, resources);

  for (const resourceEntry of resources) {
    content += generateClassExport(resourceEntry.name, resourceEntry.entries);
  }

  fs.writeFileSync(cmdOptions.out, content);
}

async function collectEntries(dir: string, out: string, isRoot: boolean, result: IResourceEntries[]): Promise<void> {
  const files = await readDir(dir);
  const item: IResourceEntries = {
    name: isRoot ? "ImageResources" : toCamelCase(dir.split(path.sep).pop()!) + "Resources",
    entries: [],
  };

  const regex = new RegExp("^((?!@).)*$");

  for (const file of files) {
    if (fs.lstatSync(path.join(dir, file)).isDirectory()) {
      await collectEntries(path.join(dir, file), out, false, result);
    } else if (regex.exec(file)) {
      const entry = new FileEntry(dir, out, file);
      item.entries.push(entry);
    }
  }

  result.push(item);
}

function generateClassExport(className: string, entries: FileEntry[]): string {
  return `\n\nexport class ${className} {\n${entries.map((entry) => getEntryDeclaration(entry)).join("\n")}\n}`;
}

function getEntryDeclaration(entry: FileEntry): string {
  if (cmdOptions.ts) {
    return `  static readonly ${entry.variableName}: ImageURISource = require("${entry.relativeResourcePath}");`;
  } else {
    return `  static ${entry.variableName} = require("${entry.relativeResourcePath}");`;
  }
}

function readDir(dir: string): Promise<string[]> {
  return new Promise((resolve, reject): void => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        reject(err);
      }
      resolve(files);
    });
  });
}

function toCamelCase(str: string): string {
  return str.substr(0, 1).toUpperCase() + str.substr(1);
}

function checkOptions(options: Options) {
  if (options.dir == null || options.out == null) {
    throw new Error(`Missing non-optional options.\nList of options:\n ${cmdUsage}`);
  }
}

const transliterationOptions: OptionsTransliterate = {
  trim: true,
};

async function prepareFiles(dir: string): Promise<void> {
  const files = await readDir(dir);
  for (const file of files) {
    if (fs.lstatSync(path.join(dir, file)).isDirectory()) {
      await prepareFiles(path.join(dir, file));
    } else {
      const escapedFile = transliterate(file, transliterationOptions)
        .replace(/[,]/g, ".")
        .replace(/[^A-Za-z0-9_@.]/g, "_");

      if (escapedFile != file) {
        fs.renameSync(path.join(dir, file), path.join(dir, escapedFile));
      }
    }
  }
}

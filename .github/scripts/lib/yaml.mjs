// Thin wrapper around the `yaml` package so call-sites don't import it
// directly. Centralised here so we can swap implementations later.

import { readFile } from "node:fs/promises";
import { parse } from "yaml";

/**
 * Read a YAML file and parse it. Throws if the file doesn't exist or
 * the YAML is malformed.
 *
 * @template T
 * @param {string} path
 * @returns {Promise<T>}
 */
export async function loadYaml(path) {
  const text = await readFile(path, "utf8");
  return /** @type {T} */ (parse(text));
}

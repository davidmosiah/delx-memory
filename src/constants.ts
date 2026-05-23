import { homedir } from "node:os";
import { join } from "node:path";

export const SERVER_NAME = "delx-memory";
export const SERVER_VERSION = "0.1.0";
export const NPM_PACKAGE_NAME = "delx-memory";
export const PINNED_NPM_PACKAGE = `${NPM_PACKAGE_NAME}@${SERVER_VERSION}`;

export const DEFAULT_DB_DIR = join(homedir(), ".delx-memory");
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, "db.sqlite");

// Hard limits — we are NOT a blob store. Keep this small to discourage misuse.
export const MAX_VALUE_BYTES = 64 * 1024; // 64 KB per value, JSON-stringified
export const MAX_KEY_LENGTH = 512;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 500;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 100;

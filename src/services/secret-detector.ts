/**
 * Vendored from delx-wellness/lib/profile-store.ts.
 *
 * delx-memory is a general-purpose key/value memory layer for AI agents.
 * It is NOT a secrets manager. We refuse to store credential-shaped keys
 * or credential-shaped string values so that an over-eager agent cannot
 * silently leak its own OAuth tokens, API keys, refresh tokens, or
 * cookies into shared local memory.
 *
 * Two layers of defense:
 *   1. Key pattern: any key that looks like it names a credential is rejected.
 *   2. Value pattern: any STRING value (or nested string) that looks like a
 *      real credential (JWT, Bearer token, Stripe sk_live_, Slack xoxb-,
 *      GitHub PAT, OpenAI sk-..., Authorization header) is rejected.
 *
 * False-positive policy: SECRET_VALUE_PATTERNS must be high-specificity.
 * Users will legitimately store sentences containing the words "token",
 * "refresh", "secret", "cookie", "session" inside memory values — those
 * are fine. Only credential shapes trigger.
 */

// Matched against KEY NAMES. Permissive on purpose — users naming a memory
// entry `oauth_user` or `password_strategy` almost certainly do not want
// that material in a shared SQLite file.
export const SECRET_KEY_PATTERNS =
  /(oauth|token|secret|password|cookie|refresh|api[_-]?key|bearer|credential|session[_-]?id)/i;

// Matched against FIELD VALUES (free text). High-specificity.
export const SECRET_VALUE_PATTERNS =
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{20,}|sk_(live|test)_[A-Za-z0-9]{20,}|xox[bporas]-[A-Za-z0-9-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[posru]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16,}|Authorization:\s*[A-Za-z]+\s+[A-Za-z0-9._-]+)/;

export type SecretRejection =
  | { kind: "key"; key: string }
  | { kind: "value"; path: string; pattern: string };

function describeValuePattern(value: string): string {
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(value)) return "JWT";
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(value)) return "Bearer token";
  if (/sk_(live|test)_[A-Za-z0-9]{20,}/.test(value)) return "Stripe secret key";
  if (/xox[bporas]-[A-Za-z0-9-]{20,}/.test(value)) return "Slack token";
  if (/github_pat_[A-Za-z0-9_]{20,}/.test(value)) return "GitHub PAT (github_pat_)";
  if (/gh[posru]_[A-Za-z0-9_]{20,}/.test(value)) return "GitHub token (ghp_/gho_/...)";
  if (/AKIA[A-Z0-9]{16,}/.test(value)) return "AWS access key";
  if (/sk-[A-Za-z0-9_-]{20,}/.test(value)) return "OpenAI/Anthropic-style sk- key";
  if (/Authorization:\s*[A-Za-z]+\s+[A-Za-z0-9._-]+/.test(value)) return "Authorization header";
  return "credential-shaped value";
}

const REFUSAL_HINT =
  "delx-memory will not store secrets. Use a system keychain (macOS Keychain, gnome-keyring, " +
  "Windows Credential Manager) or each connector's own local config (e.g. ~/.whoop-mcp/, " +
  "~/.oura-mcp/) for credentials.";

/**
 * Throws if `key` matches a credential-shaped name.
 */
export function assertKeyNotSecret(key: string): void {
  if (SECRET_KEY_PATTERNS.test(key)) {
    throw new Error(
      `Refusing to store: key '${key}' looks like a credential name. ${REFUSAL_HINT}`,
    );
  }
}

/**
 * Throws if `value` (string or nested object/array) contains a credential
 * shape. Walks objects recursively. Also rejects nested keys that match
 * SECRET_KEY_PATTERNS — an object like `{ refresh_token: "..." }` is
 * blocked even if the value itself is short.
 */
export function assertValueNotSecret(value: unknown): void {
  function scan(node: unknown, path: string[]): void {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (SECRET_VALUE_PATTERNS.test(node)) {
        const flat = path.join(".") || "<value>";
        const desc = describeValuePattern(node);
        throw new Error(
          `Refusing to store: value at '${flat}' matches ${desc} pattern. ${REFUSAL_HINT}`,
        );
      }
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      node.forEach((entry, i) => scan(entry, [...path, String(i)]));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (SECRET_KEY_PATTERNS.test(k)) {
          const flat = [...path, k].join(".");
          throw new Error(
            `Refusing to store: nested field name '${flat}' looks like a credential name. ${REFUSAL_HINT}`,
          );
        }
        scan(v, [...path, k]);
      }
    }
  }
  scan(value, []);
}

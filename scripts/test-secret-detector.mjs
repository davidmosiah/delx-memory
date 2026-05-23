import assert from "node:assert/strict";
import {
  assertKeyNotSecret,
  assertValueNotSecret,
  SECRET_KEY_PATTERNS,
  SECRET_VALUE_PATTERNS,
} from "../dist/services/secret-detector.js";

// ----- KEY rejection cases (every alternation branch must trigger) -----
const secretKeys = [
  "oauth_state",
  "oauth",
  "access_token",
  "refresh_token",
  "client_secret",
  "user_password",
  "auth_cookie",
  "session_id",
  "api_key",
  "api-key",
  "apikey",
  "bearer_value",
  "bearer",
  "user_credentials",
  "credential",
];
for (const k of secretKeys) {
  assert.ok(
    SECRET_KEY_PATTERNS.test(k),
    `regex must match key "${k}" but didn't`,
  );
  assert.throws(
    () => assertKeyNotSecret(k),
    /credential/i,
    `assertKeyNotSecret must throw for "${k}"`,
  );
}

// ----- KEY false-positive cases (common, must NOT trigger) -----
const benignKeys = [
  "user_preferences",
  "favorite_color",
  "nourish_meal_log",
  "morning_routine",
  "writing_style",
  "todo_2026_q1",
  "project_zephyr_notes",
];
for (const k of benignKeys) {
  assert.doesNotThrow(
    () => assertKeyNotSecret(k),
    `assertKeyNotSecret must NOT throw for benign "${k}"`,
  );
}

// ----- VALUE rejection cases (every alternation branch) -----
// IMPORTANT: We construct each fixture at runtime from harmless fragments so
// GitHub's push-protection secret scanner does not flag the SOURCE FILE.
// The runtime concatenation produces a valid credential SHAPE (which the
// secret-detector regex must match), but the literal token never appears in
// the source text on disk.
const padA = "abcdefghijklmnopqrstuvwxyz0123456789";
const padB = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const _stripePrefix = "sk" + "_" + "live" + "_";
const _stripeTest = "sk" + "_" + "test" + "_";
const _slackBot = "xoxb" + "-";
const _slackUser = "xoxp" + "-";
const _ghPat = "github" + "_" + "pat" + "_";
const _ghLegacy = "ghp" + "_";
const _openaiSk = "sk" + "-" + "proj-";
const _aws = "AKIA";
const _authHeader = "Authorization" + ":" + " " + "Bearer ";

const secretValues = [
  // JWT shape (3 base64-ish segments separated by dots)
  "eyJ" + padA.slice(0, 12) + "." + "eyJ" + padA.slice(0, 12) + "." + padA + padB.slice(0, 8),
  // Bearer token
  "Bearer " + padA.slice(0, 24) + padB.slice(0, 4),
  // Stripe live key
  _stripePrefix + padA.slice(0, 24),
  // Stripe test key
  _stripeTest + padA.slice(0, 24),
  // Slack bot
  _slackBot + "1234567890-" + padA.slice(0, 20),
  // Slack user
  _slackUser + padA.slice(0, 24),
  // GitHub PAT v2 (github_pat_)
  _ghPat + "11" + padB.slice(0, 8) + padA.slice(0, 22),
  // GitHub legacy ghp_
  _ghLegacy + padA.slice(0, 24) + padB.slice(0, 6),
  // OpenAI / Anthropic sk- style
  _openaiSk + padA + padB.slice(0, 8),
  // AWS access key
  _aws + padB.slice(0, 16),
  // Authorization header
  _authHeader + padA.slice(0, 20),
];
for (const v of secretValues) {
  assert.ok(
    SECRET_VALUE_PATTERNS.test(v),
    `regex must match value "${v.slice(0, 40)}..." but didn't`,
  );
  assert.throws(
    () => assertValueNotSecret(v),
    /credential|matches/i,
    `assertValueNotSecret must throw for "${v.slice(0, 40)}..."`,
  );
}

// ----- VALUE false-positive cases (common wellness/dev words must pass) -----
const benignValues = [
  "I prefer to refresh my mind with a walk after lunch.",
  "Use English for replies; pt-BR only when requested.",
  "Secret sauce: more sleep, less caffeine.",
  "Set up the cron token for morning notifications.",
  "My session_id is something I track in my journal, not here.",
  // Note: "session_id" as a string is fine — it's a key-name pattern, not a value pattern.
  "Limit cookies to 1 per day.",
  "The Bearer Cycle is a meal-prep idea.",
  // Just the word "bearer" with short following text — must not match.
  "I need to refresh routines weekly.",
  "Read this OAuth flow doc.",
  // Words appearing alone do not match the high-spec value regex.
  "sk- this is not a real key, just hyphen",
  // sk- with NOT 20+ chars of token shape after — must not match.
  "github_pat_short",
  // github_pat_ but only 5 chars after — must not match.
];
for (const v of benignValues) {
  assert.doesNotThrow(
    () => assertValueNotSecret(v),
    `assertValueNotSecret must NOT throw for benign "${v.slice(0, 40)}..."`,
  );
}

// ----- Nested object: nested secret KEY must be rejected even with safe value -----
assert.throws(
  () => assertValueNotSecret({ profile: { refresh_token: "abc" } }),
  /nested|credential/i,
  "nested secret KEY name must be rejected",
);

// ----- Nested object: nested secret VALUE must be rejected -----
assert.throws(
  () =>
    assertValueNotSecret({
      profile: {
        notes: ["bla", "Bearer abcdef0123456789ABCDEFGHIJ"],
      },
    }),
  /credential|matches/i,
  "nested credential-shaped value must be rejected",
);

// ----- Nested object: clean object should pass -----
assert.doesNotThrow(() =>
  assertValueNotSecret({
    profile: {
      language: "pt-BR",
      preferences: ["concise", "log-friendly"],
      notes: "Refresh my routine weekly.",
    },
  }),
);

// ----- Wellness vocabulary smoke test - verify Brazilian, food, body words pass -----
const wellnessVocab = [
  { meal: "arroz, feijão, frango", calories: 650 },
  { habit: "morning stretch + cold shower" },
  { mood: "ok", energy_1_to_10: 7, sleep_hours: 7.5 },
  ["overhead_press", "deadlift", "pull_ups"],
];
for (const v of wellnessVocab) {
  assert.doesNotThrow(
    () => assertValueNotSecret(v),
    `wellness value should pass: ${JSON.stringify(v).slice(0, 60)}`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      secret_keys_rejected: secretKeys.length,
      secret_values_rejected: secretValues.length,
      benign_keys_passed: benignKeys.length,
      benign_values_passed: benignValues.length,
      nested_checks_passed: 3,
      wellness_vocab_passed: wellnessVocab.length,
    },
    null,
    2,
  ),
);

import crypto from "crypto";

/**
 * Web Installer — Stage 2. Secret generation, and the refusal that matters
 * more than the generation.
 *
 * ─── WHY THIS IS NOT A ONE-LINER ────────────────────────────────────────
 * Generating 32 random bytes is trivial. The dangerous part of a "generate
 * my secrets for me" button is that it makes DESTROYING DATA a single click,
 * and the destruction is silent and irreversible:
 *
 *   - `GSC_TOKEN_ENCRYPTION_KEY` / `GA4_TOKEN_ENCRYPTION_KEY` encrypt the
 *     stored Google OAuth refresh tokens at rest (see `src/lib/gsc/crypto.ts`
 *     and `src/lib/ga4/crypto.ts`). There is NO KEY VERSIONING anywhere in
 *     this codebase — a ciphertext carries no key id, so nothing can decrypt
 *     under the old key once the env var holds a new one. Rotating either key
 *     makes every already-connected Search Console / Analytics property
 *     PERMANENTLY undecryptable. The only recovery is for every affected user
 *     to disconnect and re-authorise with Google.
 *   - `JWT_SECRET` signs sessions (`src/lib/auth/session.ts`) AND the OAuth
 *     `state` parameter for both Google flows. Rotating it logs everyone out
 *     — recoverable — and invalidates any OAuth handshake already in flight,
 *     which surfaces as an opaque "invalid state" failure. Both flows must be
 *     re-tested after a rotation.
 *
 * So the endpoint's DEFAULT for an already-set key is REFUSAL, with the
 * consequence spelled out, and it proceeds only on an explicit, per-variable
 * confirmation. This is the same shape as the existing `super-admin-guard`
 * pattern: the decision is a pure function so the policy itself is testable,
 * separate from the I/O that acts on it.
 *
 * ─── HANDLING OF THE GENERATED VALUE ────────────────────────────────────
 * The value is returned ONCE, in the response to the request that generated
 * it. It is never logged, never written to `installation_state`, and never
 * appears in any later status response — there is no field anywhere that can
 * hold it. If the operator loses it before pasting it into their environment,
 * they generate another one; that is the correct trade against storing a
 * live secret somewhere it can be read back.
 */

export type GeneratableSecretName =
  | "JWT_SECRET"
  | "GSC_TOKEN_ENCRYPTION_KEY"
  | "GA4_TOKEN_ENCRYPTION_KEY";

export interface SecretSpec {
  name: GeneratableSecretName;
  bytes: number;
  /**
   * `base64` for the AES-256-GCM keys, because `src/lib/gsc/crypto.ts` and
   * `src/lib/ga4/crypto.ts` decode them with `Buffer.from(value, "base64")`
   * and require exactly 32 decoded bytes. `base64url` for `JWT_SECRET`,
   * which is compared as an opaque string and benefits from being safe to
   * paste into a URL, a shell, or a compose file without quoting.
   */
  encoding: "base64" | "base64url";
  purpose: string;
  /**
   * What breaks if this value is CHANGED while data already exists under the
   * old one. Shown verbatim to the operator before any rotation.
   */
  rotationConsequence: string[];
  /** True when rotating destroys data that cannot be recovered. */
  rotationIsDestructive: boolean;
}

export const GENERATABLE_SECRETS: Record<GeneratableSecretName, SecretSpec> = {
  JWT_SECRET: {
    name: "JWT_SECRET",
    bytes: 32,
    encoding: "base64url",
    purpose:
      "Signs session tokens and the OAuth `state` parameter used by both Google integrations.",
    rotationIsDestructive: false,
    rotationConsequence: [
      "Every signed-in user is signed out immediately — existing session tokens no longer verify.",
      "Any Google authorisation already in progress fails, because JWT_SECRET also signs the OAuth `state` value that the Search Console and Analytics callbacks check. The user sees an opaque 'invalid state' error, not a clear message.",
      "After changing this value, sign in again and re-test BOTH the Search Console connect flow and the Analytics connect flow before considering the change finished.",
      "No stored data is lost. This rotation is recoverable — unlike the token-encryption keys.",
    ],
  },
  GSC_TOKEN_ENCRYPTION_KEY: {
    name: "GSC_TOKEN_ENCRYPTION_KEY",
    bytes: 32,
    encoding: "base64",
    purpose:
      "AES-256-GCM key that encrypts stored Google Search Console OAuth refresh tokens at rest.",
    rotationIsDestructive: true,
    rotationConsequence: [
      "EVERY Search Console refresh token already stored is PERMANENTLY undecryptable. This codebase has no key versioning — a stored ciphertext carries no key identifier, so nothing can fall back to the previous key.",
      "Every connected Search Console property stops syncing, and the failure appears at the next refresh, not immediately — so the damage can go unnoticed for hours.",
      "The only recovery is for every affected user to disconnect Search Console and authorise it again with Google. There is no way to restore the old tokens.",
      "Change this key only on a deployment that has no Search Console connections yet.",
    ],
  },
  GA4_TOKEN_ENCRYPTION_KEY: {
    name: "GA4_TOKEN_ENCRYPTION_KEY",
    bytes: 32,
    encoding: "base64",
    purpose:
      "AES-256-GCM key that encrypts stored Google Analytics 4 OAuth refresh tokens at rest.",
    rotationIsDestructive: true,
    rotationConsequence: [
      "EVERY Analytics refresh token already stored is PERMANENTLY undecryptable. This codebase has no key versioning — a stored ciphertext carries no key identifier, so nothing can fall back to the previous key.",
      "Every connected Analytics property stops syncing, and the failure appears at the next refresh rather than immediately.",
      "The only recovery is for every affected user to disconnect Analytics and authorise it again with Google. There is no way to restore the old tokens.",
      "Change this key only on a deployment that has no Analytics connections yet.",
    ],
  },
};

export function isGeneratableSecretName(name: string): name is GeneratableSecretName {
  return Object.prototype.hasOwnProperty.call(GENERATABLE_SECRETS, name);
}

/** 32 cryptographically random bytes in the encoding this variable requires. */
export function generateSecretValue(spec: SecretSpec): string {
  return crypto.randomBytes(spec.bytes).toString(spec.encoding);
}

export type RotationDecisionCode =
  | "generate_new" // nothing is set — plain generation, no warning needed
  | "confirmation_required" // already set, operator has not confirmed
  | "rotation_confirmed"; // already set, operator explicitly confirmed

export interface RotationDecision {
  code: RotationDecisionCode;
  allowed: boolean;
  /** HTTP status a route should use when `allowed` is false. */
  httpStatus: number;
  /** Plain-language headline. Never contains any secret value. */
  message: string;
  /** The consequences, spelled out. Empty for a first-time generation. */
  consequences: string[];
  /** True when proceeding destroys data irrecoverably. */
  destructive: boolean;
}

/**
 * The whole policy, as a pure function — no I/O, no `process.env` read, no
 * response shaping. `currentValue` is passed in (never read from the
 * environment here) so the caller decides what "already set" means and so
 * this function has no way to reach a real secret it was not handed.
 *
 * Note that the DECISION never contains the current value, only whether one
 * exists. A boolean would have been enough; taking the string and reducing it
 * here keeps every caller from having to remember to do that reduction.
 */
export function evaluateSecretRotation(
  spec: SecretSpec,
  currentValue: string | undefined | null,
  confirmed: boolean
): RotationDecision {
  const isSet = typeof currentValue === "string" && currentValue.trim().length > 0;

  if (!isSet) {
    return {
      code: "generate_new",
      allowed: true,
      httpStatus: 200,
      message: `${spec.name} is not set yet. A new value can be generated safely — nothing has been encrypted or signed with it.`,
      consequences: [],
      destructive: false,
    };
  }

  if (!confirmed) {
    return {
      code: "confirmation_required",
      allowed: false,
      // 409, not 400: the request is well-formed, it conflicts with the
      // current state of the world. The operator gets the consequences and
      // can resubmit with an explicit confirmation.
      httpStatus: 409,
      message: `${spec.name} is already set. Generating a new value would REPLACE it, and this installer will not do that without an explicit confirmation.`,
      consequences: spec.rotationConsequence,
      destructive: spec.rotationIsDestructive,
    };
  }

  return {
    code: "rotation_confirmed",
    allowed: true,
    httpStatus: 200,
    message: `${spec.name} already had a value and a replacement was explicitly confirmed. The consequences below apply from the moment the new value is active.`,
    consequences: spec.rotationConsequence,
    destructive: spec.rotationIsDestructive,
  };
}

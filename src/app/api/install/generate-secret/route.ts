import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  GENERATABLE_SECRETS,
  evaluateSecretRotation,
  generateSecretValue,
  isGeneratableSecretName,
} from "@/lib/install/actions/secrets";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";

/**
 * Web Installer — POST /api/install/generate-secret
 *
 * Returns a freshly generated secret ONCE, in this response, for the operator
 * to copy into their environment. It is never logged, never persisted, and
 * there is no field anywhere in `/api/install/status` that could carry it
 * back — the value exists in this response body and nowhere else on the
 * server.
 *
 * A MUTATION, even though it writes nothing: it is the first half of an
 * action that replaces a live key, and the refusal it enforces is the whole
 * point of the endpoint. Treating it as a read would let it be used while the
 * installation state is `unknown`.
 *
 * The refusal: if the variable already has a value, this returns 409 with the
 * consequences spelled out and generates nothing. Only a request carrying an
 * explicit `confirmRotation: true` for that specific variable proceeds. See
 * `src/lib/install/actions/secrets.ts` for why rotating either token-
 * encryption key is unrecoverable.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  token: z.string().optional(),
  name: z.string().min(1),
  /** Must name the SAME variable — a blanket "yes" cannot rotate a key the operator was not looking at. */
  confirmRotation: z.string().optional(),
});

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body }) => {
      if (!isGeneratableSecretName(body.name)) {
        return installerJson(
          {
            error: `${body.name} is not a value this installer generates.`,
            generatable: Object.keys(GENERATABLE_SECRETS),
          },
          400
        );
      }

      const spec = GENERATABLE_SECRETS[body.name];
      const confirmed = body.confirmRotation === body.name;
      const decision = evaluateSecretRotation(spec, process.env[spec.name], confirmed);

      if (!decision.allowed) {
        return installerJson(
          {
            generated: false,
            name: spec.name,
            code: decision.code,
            error: decision.message,
            consequences: decision.consequences,
            destructive: decision.destructive,
            purpose: spec.purpose,
            // The wizard echoes this back to proceed. Naming the variable
            // makes a confirmation for one key useless for another.
            confirmWith: { confirmRotation: spec.name },
          },
          decision.httpStatus
        );
      }

      return installerJson({
        generated: true,
        name: spec.name,
        code: decision.code,
        // Returned once. Nothing on the server keeps a copy.
        value: generateSecretValue(spec),
        purpose: spec.purpose,
        message: decision.message,
        consequences: decision.consequences,
        destructive: decision.destructive,
        notes: [
          "This value is shown once and is not stored anywhere it can be read back. If you lose it before saving it, generate another one.",
          "It is not active until it is in the application's environment AND the application has been restarted — writing a value does not reload process.env.",
        ],
      });
    },
    "generate-secret"
  );
}

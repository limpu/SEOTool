import { z } from "zod";
import type { NextRequest } from "next/server";
import { testOllama } from "@/lib/install/actions/ollama";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";

/**
 * Web Installer — POST /api/install/test-ollama
 *
 * Reachability, model availability, and a tiny REAL completion through the
 * application's own `AiProvider` gateway. Three separate facts, because they
 * fail independently and have different fixes — a host that is up with the
 * model absent looks identical to a working setup if only reachability is
 * checked.
 *
 * EVERY outcome is non-blocking and the response says so explicitly. AI is an
 * optional layer here: the crawler, every deterministic rule engine, Search
 * Console, Analytics, PageSpeed and all reporting work with no model at all.
 * A failure must never prevent the installation from completing, and the
 * status code is 200 even for a failed test precisely so no client can
 * mistake "the model is not available" for "the installer is broken".
 *
 * Classed as a MUTATION despite writing nothing: it makes a real outbound
 * request to a host the environment names, which is a side effect, and the
 * capability split should not let that run while installation state is
 * unknown.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ token: z.string().optional() });

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async () => {
      const outcome = await testOllama();
      console.log(`[install/test-ollama] result: ${outcome.cause}`);
      return installerJson({
        ...outcome,
        optional: true,
        optionalNote:
          "AI is optional and this result never blocks installation. Without a model, every AI-assisted feature reports itself as 'AI not configured' rather than failing, and no other part of the platform is affected.",
      });
    },
    "test-ollama"
  );
}

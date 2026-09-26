import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { checkRateLimit } from "@/lib/auth";
import { getGa4Connection } from "@/lib/ga4/queries";
import { ensureFreshGa4AccessToken, Ga4NotConnectedError, Ga4NoPropertySelectedError } from "@/lib/ga4/token";
import { runGa4Report, Ga4ApiError } from "@/lib/ga4/client";
import { GoogleTokenExchangeError } from "@/lib/ga4/oauth";
import {
  getDefaultGa4DateRange,
  trafficReportBody,
  pagePerformanceReportBody,
  acquisitionReportBody,
  conversionReportBody,
} from "@/lib/ga4/reports";
import {
  parseTrafficReport,
  parsePagePerformanceReport,
  parseAcquisitionReport,
  parseConversionReport,
} from "@/lib/ga4/parse";

const idSchema = z.string().uuid();

/**
 * Live GA4 report fetch — the deliberate "connection + live reporting"
 * scope decision for this phase (read.md Phase 36): unlike GSC's
 * sync-then-persist model, no `ga4_metrics` history table exists yet, so
 * every view of the Analytics page's data calls the Data API's `runReport`
 * directly for the four scoped categories (Traffic, Page performance,
 * Acquisition, Conversion) and returns the parsed result — nothing is
 * fabricated or cached beyond this single request/response. Rate-limited
 * (see rate-limit.ts's `ga4_report`) since this is a real Google API call
 * on every invocation, not a DB read.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const site = await getWebsiteForUser(user.id, id);
  if (!site) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }

  const rl = await checkRateLimit(user.id, "ga4_report");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many Google Analytics report requests. Please try again later." },
      { status: 429 }
    );
  }

  const connection = await getGa4Connection(site.id);
  if (!connection) {
    return NextResponse.json({ error: "Google Analytics is not connected for this website." }, { status: 409 });
  }
  if (!connection.propertyId) {
    return NextResponse.json(
      { error: "No Google Analytics property has been selected for this website yet." },
      { status: 409 }
    );
  }

  try {
    const accessToken = await ensureFreshGa4AccessToken(connection);
    const range = getDefaultGa4DateRange();

    const [trafficJson, pagesJson, acquisitionJson, conversionJson] = await Promise.all([
      runGa4Report(accessToken, connection.propertyId, trafficReportBody(range)),
      runGa4Report(accessToken, connection.propertyId, pagePerformanceReportBody(range)),
      runGa4Report(accessToken, connection.propertyId, acquisitionReportBody(range)),
      runGa4Report(accessToken, connection.propertyId, conversionReportBody(range)),
    ]);

    return NextResponse.json({
      success: true,
      dateRangeStart: range.startDate,
      dateRangeEnd: range.endDate,
      traffic: parseTrafficReport(trafficJson),
      pages: parsePagePerformanceReport(pagesJson),
      acquisition: parseAcquisitionReport(acquisitionJson),
      conversion: parseConversionReport(conversionJson),
    });
  } catch (err) {
    if (err instanceof Ga4NotConnectedError || err instanceof Ga4NoPropertySelectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Ga4ApiError || err instanceof GoogleTokenExchangeError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}

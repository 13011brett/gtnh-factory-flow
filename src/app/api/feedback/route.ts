import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { encodePlanCode, planCodeLink } from "@/lib/import-export/plan-code";
import { checkRateLimit, isCommunityConfigured, makeActorKey } from "@/lib/server/community";
import {
  FEEDBACK_MAX_BYTES,
  FEEDBACK_REPO,
  type FeedbackLinks,
  issueBody,
  issueLabels,
  issueTitle,
  linkFits,
  openIssue,
  parseFeedback,
  planFile,
} from "@/lib/server/feedback";
import { storeFeedbackFile } from "@/lib/server/feedback-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where the issues are opened, and the site the links point at. */
const SITE = "https://gtnhplanner.com";
/** Reports per player (device and address) in an hour. */
const REPORTS_PER_HOUR = 5;

/**
 * A report from the in-game Feedback box, opened as a GitHub issue on the planner's repo. Answers the issue's
 * number and page, which the game shows.
 */
export async function POST(request: Request) {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  if (!token || !isCommunityConfigured()) {
    return NextResponse.json({ error: "Reports can't be sent yet." }, { status: 503 });
  }
  try {
    const raw = await request.text();
    if (raw.length > FEEDBACK_MAX_BYTES) {
      return NextResponse.json({ error: "The report is too big. Send fewer plans." }, { status: 413 });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "That report could not be read." }, { status: 400 });
    }
    const report = parseFeedback(json);
    if ("error" in report) {
      return NextResponse.json({ error: report.error }, { status: 400 });
    }
    if (!(await checkRateLimit(makeActorKey(request, report.deviceId), "feedback", REPORTS_PER_HOUR, 60 * 60))) {
      return NextResponse.json({ error: "That's a lot of reports. Try again in an hour." }, { status: 429 });
    }

    const id = randomUUID();
    const links: FeedbackLinks = { plans: [] };
    for (let i = 0; i < report.plans.length; i++) {
      const { name, plan } = report.plans[i]!;
      let link: string | undefined;
      try {
        const candidate = planCodeLink(await encodePlanCode(plan), SITE);
        link = linkFits(candidate) ? candidate : undefined;
      } catch {
        link = undefined;
      }
      const file = await storeFeedbackFile(
        SITE,
        id,
        `plan-${i + 1}.json`,
        Buffer.from(planFile(plan)),
        "application/json",
      );
      links.plans.push({ name, cards: plan.nodes.length, link, file });
    }
    if (report.picture) {
      links.picture = await storeFeedbackFile(SITE, id, "picture.png", report.picture, "image/png");
    }

    const { body, plansComment } = issueBody(report, links);
    const issue = await openIssue(token, process.env.GITHUB_FEEDBACK_REPO || FEEDBACK_REPO, {
      title: issueTitle(report),
      body,
      labels: issueLabels(report),
      plansComment,
    });
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    console.error("feedback report failed", error);
    return NextResponse.json({ error: "The report could not be sent. Try again later." }, { status: 502 });
  }
}

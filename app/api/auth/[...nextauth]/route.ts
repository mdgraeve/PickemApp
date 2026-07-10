import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

const WINDOW_MS = 15 * 60_000;
const EMAIL_LIMIT = 3; // magic-link requests per email per window
const IP_LIMIT = 10; // magic-link requests per IP per window

// Rate limit magic-link requests (POST /api/auth/signin/email) so the
// sign-in endpoint can't be used to spam arbitrary inboxes or burn through
// the email-sending quota. All other NextAuth routes pass straight through.
async function rateLimitMagicLink(request: Request): Promise<Response | null> {
  let email = "";
  try {
    const form = await request.clone().formData();
    email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
  } catch {
    // Unparseable body — let NextAuth produce its own error response.
    return null;
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const emailCheck = email
    ? checkRateLimit(`magic-link:email:${email}`, EMAIL_LIMIT, WINDOW_MS)
    : { ok: true, retryAfterMs: 0 };
  const ipCheck = checkRateLimit(`magic-link:ip:${ip}`, IP_LIMIT, WINDOW_MS);

  if (emailCheck.ok && ipCheck.ok) return null;

  const retryAfterMs = Math.max(emailCheck.retryAfterMs, ipCheck.retryAfterMs);
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
      // NextAuth's client reads `url` from sign-in responses; point it back
      // at the login page with an error code so redirect-mode calls don't
      // silently land on the callback URL.
      url: `${origin}/login?error=RateLimited`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    },
  );
}

async function POST(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const { nextauth } = await context.params;
  if (nextauth?.[0] === "signin" && nextauth?.[1] === "email") {
    const limited = await rateLimitMagicLink(request);
    if (limited) return limited;
  }
  return handler(request, context);
}

export { handler as GET, POST };

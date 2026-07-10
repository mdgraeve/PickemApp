import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@/lib/db";

const emailPort = Number(process.env.EMAIL_SERVER_PORT);

// Dev-only escape hatch for local TLS interception (Norton Mail Shield
// re-signs smtp.resend.com's certificate with an untrusted root, so strict
// verification can never pass on an intercepted connection). Never honored
// in production — production must verify the real certificate chain.
const allowInterceptedTls =
  process.env.NODE_ENV !== "production" &&
  process.env.EMAIL_ALLOW_INTERCEPTED_TLS === "true";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: emailPort,
        // Implicit TLS on 465; STARTTLS upgrade on 587/25.
        secure: emailPort === 465,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
        ...(allowInterceptedTls
          ? { tls: { rejectUnauthorized: false } }
          : {}),
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
};

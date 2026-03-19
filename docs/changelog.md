# Changelog

## 2026-03-19

- Project initialized with Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- Prisma 7 configured with PostgreSQL (Neon) as the database
- NextAuth v4 selected for authentication
- Created initial documentation in `/docs`
- Designed initial database schema: User, Account, Session, VerificationToken, League, LeagueMember, Game, Pick
- Applied initial database migration (`init`)
- Set up NextAuth with GitHub OAuth provider, Prisma adapter, and database sessions
- Added SessionProvider, login page, home page with session state, and server-side auth helpers
- Fixed Prisma 7 client import path (`client.ts` entrypoint)
- Rebranded app from PickemApp to LockHub
- Switched authentication from GitHub OAuth to email magic-link sign-in
- Added `/login/verify` confirmation page for magic-link flow
- Added `nodemailer` dependency required by NextAuth email provider

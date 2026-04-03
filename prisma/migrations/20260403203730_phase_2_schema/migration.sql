-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "slateId" TEXT;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "sport" TEXT;

-- CreateTable
CREATE TABLE "SportGame" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "season" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slate" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportGame_sport_idx" ON "SportGame"("sport");

-- CreateIndex
CREATE INDEX "SportGame_scheduledAt_idx" ON "SportGame"("scheduledAt");

-- CreateIndex
CREATE INDEX "Slate_leagueId_idx" ON "Slate"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Slate_leagueId_position_key" ON "Slate"("leagueId", "position");

-- CreateIndex
CREATE INDEX "Game_slateId_idx" ON "Game"("slateId");

-- AddForeignKey
ALTER TABLE "Slate" ADD CONSTRAINT "Slate_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_slateId_fkey" FOREIGN KEY ("slateId") REFERENCES "Slate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

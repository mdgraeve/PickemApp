-- AlterTable: add nullable espnId to SportGame
ALTER TABLE "SportGame" ADD COLUMN "espnId" TEXT;

-- AlterTable: add nullable espnGameId to Game
ALTER TABLE "Game" ADD COLUMN "espnGameId" TEXT;

-- CreateIndex: enforce uniqueness on SportGame.espnId (nulls are not considered duplicates)
CREATE UNIQUE INDEX "SportGame_espnId_key" ON "SportGame"("espnId");

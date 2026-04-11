-- AlterTable
ALTER TABLE "League" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxMembers" INTEGER;

-- CreateTable
CREATE TABLE "TiebreakerQuestion" (
    "id" TEXT NOT NULL,
    "slateId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiebreakerQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TiebreakerResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiebreakerResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TiebreakerQuestion_slateId_idx" ON "TiebreakerQuestion"("slateId");

-- CreateIndex
CREATE INDEX "TiebreakerResponse_questionId_idx" ON "TiebreakerResponse"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "TiebreakerResponse_userId_questionId_key" ON "TiebreakerResponse"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "TiebreakerQuestion" ADD CONSTRAINT "TiebreakerQuestion_slateId_fkey" FOREIGN KEY ("slateId") REFERENCES "Slate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TiebreakerResponse" ADD CONSTRAINT "TiebreakerResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TiebreakerResponse" ADD CONSTRAINT "TiebreakerResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TiebreakerQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

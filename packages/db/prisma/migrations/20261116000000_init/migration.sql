-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('uk', 'en');

-- CreateEnum
CREATE TYPE "DescriptionStatus" AS ENUM ('pending', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('full', 'tts');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lang" "Lang" NOT NULL DEFAULT 'uk',
    "viewToken" TEXT NOT NULL,
    "editToken" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "rightsConfirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Painting" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "year" TEXT,
    "technique" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Painting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Description" (
    "id" TEXT NOT NULL,
    "paintingId" TEXT NOT NULL,
    "lang" "Lang" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "textEdited" BOOLEAN NOT NULL DEFAULT false,
    "audioKey" TEXT,
    "audioDuration" INTEGER,
    "uncertain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "DescriptionStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Description_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "paintingId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "descriptionId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_viewToken_key" ON "Gallery"("viewToken");

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_editToken_key" ON "Gallery"("editToken");

-- CreateIndex
CREATE INDEX "Painting_galleryId_position_idx" ON "Painting"("galleryId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Description_paintingId_lang_key" ON "Description"("paintingId", "lang");

-- CreateIndex
CREATE INDEX "GenerationJob_galleryId_createdAt_idx" ON "GenerationJob"("galleryId", "createdAt");

-- AddForeignKey
ALTER TABLE "Painting" ADD CONSTRAINT "Painting_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Description" ADD CONSTRAINT "Description_paintingId_fkey" FOREIGN KEY ("paintingId") REFERENCES "Painting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_paintingId_fkey" FOREIGN KEY ("paintingId") REFERENCES "Painting"("id") ON DELETE CASCADE ON UPDATE CASCADE;


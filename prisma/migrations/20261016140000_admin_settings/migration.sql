-- Ticket limits that the organiser can change from /admin (single row, id = 1).
CREATE TABLE "EventSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "yajamaniCapacity" INTEGER NOT NULL,
    "generalCapacity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSettings_pkey" PRIMARY KEY ("id")
);

-- Start with the original limits: 50 Yajamani, 300 General.
INSERT INTO "EventSettings" ("id", "yajamaniCapacity", "generalCapacity", "updatedAt")
VALUES (1, 50, 300, CURRENT_TIMESTAMP);

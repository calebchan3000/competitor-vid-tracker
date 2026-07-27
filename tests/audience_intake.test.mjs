import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inferIntakeFields,
  imageAttachments,
  saveDiscordAudienceBatch,
} from "../lib/audience_intake.mjs";

const pngBytes = Buffer.from("89504e470d0a1a0a", "hex");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "audience-intake-"));
}

test("imageAttachments keeps Discord image attachments and ignores non-images", () => {
  const attachments = [
    { id: "1", filename: "audience.png", content_type: "image/png", url: "https://cdn.example/audience.png" },
    { id: "2", filename: "notes.txt", content_type: "text/plain", url: "https://cdn.example/notes.txt" },
    { id: "3", filename: "demo.JPG", content_type: "application/octet-stream", url: "https://cdn.example/demo.JPG" },
  ];

  assert.deepEqual(imageAttachments(attachments).map((a) => a.id), ["1", "3"]);
});

test("inferIntakeFields reads niche/source directives from VA message content", () => {
  const inferred = inferIntakeFields({
    message: {
      content: "Audience tab upload\nniche: AA anti-dem\nsource: @williamreportsnews",
      author: { id: "edsel-id", username: "edsel" },
    },
    channelConfig: {
      defaultSlug: "anti-dem",
      defaultSourceChannel: "@mainstreetreport",
      keywordSlugs: { "aa anti-dem": "aa-anti-dem", "anti-dem": "anti-dem" },
    },
  });

  assert.equal(inferred.slug, "aa-anti-dem");
  assert.equal(inferred.sourceChannel, "@williamreportsnews");
  assert.equal(inferred.va, "edsel");
});

test("saveDiscordAudienceBatch archives images and records Discord provenance", async () => {
  const uploadsPending = tmpDir();
  const message = {
    id: "msg-123",
    channel_id: "chan-1",
    content: "niche: anti-dem\nsource: @williamreportsnews",
    timestamp: "2026-07-19T12:00:00.000Z",
    author: { id: "edsel-id", username: "edsel" },
    attachments: [
      { id: "att-1", filename: "Audience Tab.png", content_type: "image/png", url: "https://cdn.example/audience.png" },
      { id: "att-2", filename: "Demographics.jpg", content_type: "image/jpeg", url: "https://cdn.example/demo.jpg" },
    ],
  };

  const manifest = await saveDiscordAudienceBatch({
    message,
    uploadsPending,
    channelConfig: { defaultSlug: "anti-dem", defaultSourceChannel: "@williamreportsnews" },
    now: new Date("2026-07-19T12:05:00.000Z"),
    randomSuffix: "test",
    downloadAttachment: async (attachment) => Buffer.concat([pngBytes, Buffer.from(attachment.id)]),
  });

  assert.equal(manifest.slug, "anti-dem");
  assert.equal(manifest.sourceChannel, "@williamreportsnews");
  assert.equal(manifest.count, 2);
  assert.equal(manifest.discord.messageId, "msg-123");
  assert.equal(manifest.discord.authorUsername, "edsel");

  const batchDir = path.join(uploadsPending, manifest.id);
  assert.ok(fs.existsSync(path.join(batchDir, "manifest.json")));
  assert.deepEqual(fs.readdirSync(batchDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort(), [
    "01-Audience_Tab.png",
    "02-Demographics.jpeg",
  ]);
});

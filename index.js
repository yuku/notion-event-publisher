import { promisify } from "node:util";
import zlib from "node:zlib";
import { PubSub } from "@google-cloud/pubsub";
import z from "zod";
import { Client, iteratePaginatedAPI } from "@notionhq/client";
import functions from "@google-cloud/functions-framework";
import { Storage } from "@google-cloud/storage";

const gzip = promisify(zlib.gzip);

const storage = new Storage();
const pubsub = new PubSub();
const pubsubTopic = process.env.PUBSUB_TOPIC || "notion-events";
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Cloud Functions HTTP endpoint
functions.http("pollNotion", async (req, res) => {
  const { bucketName, objectPath } = parseGcsUri(process.env.GCS_OBJECT_PATH);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectPath);
  try {
    const [prevState, [currentState, pages]] = await Promise.all([
      loadPreviousState(file),
      fetchCurrentState(notion, process.env.DATABASE_ID),
    ]);
    const { created, updated, deleted } = detectChanges(
      prevState,
      currentState,
    );
    console.log("Detected changes:", {
      created: created.length,
      updated: updated.length,
      deleted: deleted.length,
    });

    await Promise.all([
      publishEvents(pubsubTopic, { created, updated, deleted }, pages),
      saveCurrentState(file, currentState),
    ]);

    res.status(200).json({
      message: "Polling complete",
      createdCount: created.length,
      updatedCount: updated.length,
      deletedCount: deleted.length,
    });
  } catch (error) {
    console.error("Error in pollNotion:", error);
    res.status(500).json({ error: error.message });
  }
});

const stateSchema = z.record(z.string());
/** @typedef {z.infer<typeof stateSchema>} State */

/**
 * fetchCurrentState retrieves the current state of the Notion database.
 * @param {import("@notionhq/client").Client} notion
 * @param {string} databaseId
 */
async function fetchCurrentState(notion, databaseId) {
  console.log("Fetching current state from Notion...");

  /** @type {State} */
  const currentState = {};
  const pages = {};

  for await (const page of iteratePaginatedAPI(notion.databases.query, {
    database_id: databaseId,
  })) {
    currentState[page.id] = page.last_edited_time;
    pages[page.id] = page;
  }

  return [currentState, pages];
}

/**
 * detectChanges compares two states and returns the differences.
 * @param {State} oldState
 * @param {State} newState
 * @returns {{created: string[], updated: string[], deleted: string[]}}
 */
export function detectChanges(oldState, newState) {
  const created = [];
  const updated = [];
  const deleted = [];

  for (const [pageId, lastEditedTime] of Object.entries(newState)) {
    if (!oldState[pageId]) {
      created.push(pageId);
    } else if (oldState[pageId] !== lastEditedTime) {
      updated.push(pageId);
    }
  }

  for (const pageId of Object.keys(oldState)) {
    if (!newState[pageId]) {
      deleted.push(pageId);
    }
  }

  return { created, updated, deleted };
}

/**
 * loadPreviousState fetches the previous state from GCS.
 * @param {import("@google-cloud/storage").File} file
 */
async function loadPreviousState(file) {
  const [exists] = await file.exists();
  if (!exists) return {};
  console.log("Loading previous state from Cloud Storage...");
  const [buffer] = await file.download();
  return stateSchema.parse(JSON.parse(buffer.toString()));
}

/**
 * saveCurrentState saves the current state to GCS.
 * @param {import("@google-cloud/storage").File} file
 * @param {State} state
 */
async function saveCurrentState(file, state) {
  console.log("Saving current state to Cloud Storage...");
  const jsonString = JSON.stringify(state);
  const compressed = await gzip(Buffer.from(jsonString, "utf-8"));

  await file.save(compressed, {
    contentType: "application/json",
    metadata: { contentEncoding: "gzip" },
  });

  console.log("State saved to Cloud Storage.");
}

/**
 * parseGcsUri parses a GCS URI into bucket and object components.
 * @param {string} uri
 * @throws {Error}
 * @returns {{bucketName: string, objectPath: string}}
 */
export function parseGcsUri(uri) {
  const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${uri}`);
  }
  return {
    bucketName: match[1],
    objectPath: match[2],
  };
}

/**
 * publishMessage publishes a message to Pub/Sub.
 * @param {string} topic
 * @param {{eventType: string, payload: {id: string}}} message
 */
async function publishMessage(topic, message) {
  const data = Buffer.from(JSON.stringify(message), "utf-8");
  pubsub.topic(topic).publishMessage({ data });
  console.log(`Published message: ${message.eventType} ${message.payload.id}`);
}

async function publishEvents(topic, { created, updated, deleted }, pages) {
  console.log("Publishing events to Pub/Sub...");
  const tasks = [];

  for (const pageId of created) {
    tasks.push(
      publishMessage(topic, {
        eventType: "page-created",
        payload: pages[pageId],
      }),
    );
  }
  for (const pageId of updated) {
    tasks.push(
      publishMessage(topic, {
        eventTYpe: "page-updated",
        payload: pages[pageId],
      }),
    );
  }
  for (const pageId of deleted) {
    tasks.push(
      publishMessage(topic, {
        eventType: "page-deleted",
        payload: { id: pageId },
      }),
    );
  }

  await Promise.all(tasks);
}

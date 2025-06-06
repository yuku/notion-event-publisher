# Notion Event Publisher

Notion Event Publisher is a simple Cloud Run function that detects changes in Notion pages and publishes events to [Cloud Pub/Sub](https://cloud.google.com/pubsub).

> [!NOTE]
>
> Notion released the [Webhook API](https://developers.notion.com/reference/webhooks) in December 2024.  
> However, it still does not provide webhooks for when an integration is added to or removed from a page or database. Therefore, this functionality remains useful.

## Environment Variables

* Required
  * `NOTION_API_KEY`
    * The API key for Notion. This function will detect changes of the pages accessible by this key.  
  * `GCS_OBJECT_PATH`
    * A URI of Cloud Storage object that stores the state of the last run.
* Optional
  * `PUBSUB_TOPIC` (default: `notion-events`)
  * `ARCHIVED_AS_DELETED`, `IN_TRASH_AS_DELETED`
    * If `"true"`, archived pages and pages in the trash are treated as deleted.

## Event Message

```ts
type Message =
  | PageCreatedMessage
  | PageUpdatedMessage
  | PageDeletedMessage

// See https://developers.notion.com/reference/page for the detail
type Page = { object: "page", id: string }

type PageCreatedMessage = {
  eventType: "page-created"
  payload: Page
}

type PageUpdatedMessage = {
  eventType: "page-updated"
  payload: Page
}

type PageDeletedMessage = {
  eventType: "page-deleted"
  payload: { id: string }
}
```

## Deployment

Clone this repository then deploy it to Cloud Run functions. Example:

```bash
FUNCTION_NAME=notion-event-publisher
REGION=asia-northeast1
GCS_OBJECT_PATH=gs://yourbucket/path/to/state/file
SECRET=YOUR_SECRET_MANAGER_NAME

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=nodejs20 \
  --region="$REGION" \
  --source=. \
  --max-instances=1 \
  --entry-point=pollNotion \
  --trigger-http \
  --set-env-vars=GCS_OBJECT_PATH="$GCS_OBJECT_PATH" \
  --set-secrets=NOTION_API_KEY="${SECRET}:latest"
```

In addition, you need to set up a Cloud Scheduler to trigger the function periodically. Example:

```bash
FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --format="value(url)")

gcloud scheduler jobs create http notion-event-publisher \
  --schedule="*/5 * * * *" \
  --uri="$FUNCTION_URL" \
  --http-method=POST \
  --message-body='{}' \
  --oidc-service-account-email="$FUNCTION_NAME@$PROJECT_ID.iam.gserviceaccount.com"
```

## How to

### Trigger the Function Manually

You can trigger the function manually by sending a request to the function URL. Example:

```bash
ACCESS_TOKEN=$(gcloud auth print-identity-token)
curl "$FUNCTION_URL" -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Publish All Pages in the Database As Created Events

Delete the state file in the Cloud Storage bucket to publish all pages in the database as created events. Then, trigger the function manually.

```bash
gsutil rm "$GCS_OBJECT_PATH"
```

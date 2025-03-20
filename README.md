# Notion Event Publisher

Notion Event Publisher is a simple Cloud Run function that detects changes in Notion pages and publishes events to [Cloud Pub/Sub](https://cloud.google.com/pubsub).

## Environment Variables

* Required
  * `NOTION_API_KEY`
  * `DATABASE_ID`
  * `GCS_OBJECT_PATH`
    * A URI of Cloud Storage object that stores the state of the last run.
* Optional
  * `PUBSUB_TOPIC` (default: `notion-events`)

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
DATABASE_ID=YOUR_NOTION_DATABASE_ID
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
  --set-env-vars=DATABASE_ID="$DATABASE_ID" \
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

### Trigger the function manually

You can trigger the function manually by sending a request to the function URL. Example:

```bash
ACCESS_TOKEN=$(gcloud auth print-identity-token)
curl $FUNCTION_URL -H "Authorization: Bearer $ACCESS_TOKEN"
```

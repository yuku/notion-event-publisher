# Notion Event Publisher

Notion Event Publisher is a simple Cloud Run function that detects changes in Notion pages and publishes events to [Cloud Pub/Sub](https://cloud.google.com/pubsub).

## Environment Variables

* Required
  * `NOTION_API_KEY`
  * `DATABASE_ID`
  * `GCS_OBJECT_PATH`
* Optional
  * `PUBSUB_TOPIC` (default: `notion-events`)

## Deplyment

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

#!/bin/bash

# Define colors to make terminal messages more visible
# Red for errors, green for success
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color (resets color)

# STEP 1: Environment variables verification
# We need these variables to create resources in GCP and BigQuery
required_vars=("GCP_PROJECT_ID" "BIGQUERY_DATASET_ID" "BIGQUERY_TABLE_ID")

# Iterate over each required variable to ensure they are defined
echo "Checking environment variables..."
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        # If any variable is not defined, show error and exit
        echo -e "${RED}Error: Environment variable $var is not defined${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required environment variables are defined${NC}"

# STEP 2: Create BigQuery dataset (EU multi-region)
echo "Creating BigQuery dataset..."
bq mk \
    --project_id="$GCP_PROJECT_ID" \
    --dataset \
    --description "Dataset for storing feedback data" \
    --location=EU \
    "$BIGQUERY_DATASET_ID"

# Check if dataset creation was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dataset successfully created in BigQuery (EU multi-region)${NC}"
else
    echo -e "${RED}Error: Could not create dataset in BigQuery${NC}"
    exit 1
fi

# STEP 3: Create BigQuery table
echo "Creating BigQuery table..."
bq mk --force \
    --project_id="$GCP_PROJECT_ID" \
    --schema="bigquery/schema.json" \
    "$BIGQUERY_DATASET_ID.$BIGQUERY_TABLE_ID"

# Check if table creation was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Table successfully created in BigQuery${NC}"
else
    echo -e "${RED}Error: Could not create table in BigQuery${NC}"
    exit 1
fi

# STEP 4: Build and deploy to Cloud Run
echo "Building Docker image..."
cd ingest && gcloud builds submit --tag "gcr.io/$GCP_PROJECT_ID/feedy" && cd ..

# Check if build was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}Error: Could not build Docker image${NC}"
    exit 1
fi

# Deploy service to Cloud Run with required configuration
echo "Deploying to Cloud Run..."
gcloud run deploy feedy \
    --image "gcr.io/$GCP_PROJECT_ID/feedy" \
    --platform managed \
    --region europe-west4 \
    --allow-unauthenticated \
    --set-env-vars "BIGQUERY_PROJECT_ID=$GCP_PROJECT_ID,BIGQUERY_DATASET_ID=$BIGQUERY_DATASET_ID,BIGQUERY_TABLE_ID=$BIGQUERY_TABLE_ID,GCP_PROJECT_ID=$GCP_PROJECT_ID"

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Service successfully deployed to Cloud Run${NC}"
else
    echo -e "${RED}Error: Could not deploy service to Cloud Run${NC}"
    exit 1
fi

# Final success message
echo -e "${GREEN}Setup completed successfully!${NC}"
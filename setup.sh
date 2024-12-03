#!/bin/bash

# Definimos colores para hacer los mensajes más visibles en la terminal
# Rojo para errores, verde para éxito
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color (resetea el color)

# PASO 1: Verificación de variables de entorno
# Necesitamos estas variables para crear recursos en GCP y BigQuery
required_vars=("GCP_PROJECT_ID" "BIGQUERY_DATASET_ID" "BIGQUERY_TABLE_ID")

# Iteramos sobre cada variable requerida para asegurarnos que estén definidas
echo "Verificando variables de entorno..."
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        # Si alguna variable no está definida, mostramos error y terminamos
        echo -e "${RED}Error: La variable de entorno $var no está definida${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ Todas las variables de entorno requeridas están definidas${NC}"

# PASO 2: Creación del dataset en BigQuery (multi-región EU)
echo "Creando dataset en BigQuery..."
bq mk \
    --project_id="$GCP_PROJECT_ID" \
    --dataset \
    --description "Dataset para almacenar datos de feedback" \
    --location=EU \
    "$BIGQUERY_DATASET_ID"

# Verificamos si la creación del dataset fue exitosa
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dataset creado exitosamente en BigQuery (EU multi-región)${NC}"
else
    echo -e "${RED}Error: No se pudo crear el dataset en BigQuery${NC}"
    exit 1
fi

# PASO 3: Creación de la tabla en BigQuery
# Usamos el comando 'bq' de Google Cloud para crear la tabla
# --force: sobrescribe la tabla si ya existe
# --schema: usa el esquema definido en bigquery/schema.json
echo "Creando tabla en BigQuery..."
bq mk --force \
    --project_id="$GCP_PROJECT_ID" \
    --schema="bigquery/schema.json" \
    "$BIGQUERY_DATASET_ID.$BIGQUERY_TABLE_ID"

# Verificamos si la creación de la tabla fue exitosa
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tabla creada exitosamente en BigQuery${NC}"
else
    echo -e "${RED}Error: No se pudo crear la tabla en BigQuery${NC}"
    exit 1
fi

# PASO 4: Construcción y despliegue en Cloud Run
# Primero construimos la imagen Docker y la subimos al Container Registry
echo "Construyendo imagen Docker..."
gcloud builds submit --tag "gcr.io/$GCP_PROJECT_ID/feedy"

# Verificamos si la construcción fue exitosa
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Imagen Docker construida exitosamente${NC}"
else
    echo -e "${RED}Error: No se pudo construir la imagen Docker${NC}"
    exit 1
fi

# Desplegamos el servicio en Cloud Run con la configuración necesaria
# --platform managed: usa la versión administrada de Cloud Run
# --region: región donde se desplegará el servicio
# --allow-unauthenticated: permite acceso público
# --set-env-vars: configura las variables de entorno necesarias
echo "Desplegando en Cloud Run..."
gcloud run deploy feedy \
    --image "gcr.io/$GCP_PROJECT_ID/feedy" \
    --platform managed \
    --region europe-west4 \
    --allow-unauthenticated \
    --set-env-vars "BIGQUERY_PROJECT_ID=$GCP_PROJECT_ID,BIGQUERY_DATASET_ID=$BIGQUERY_DATASET_ID,BIGQUERY_TABLE_ID=$BIGQUERY_TABLE_ID,GCP_PROJECT_ID=$GCP_PROJECT_ID"

# Verificamos si el despliegue fue exitoso
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Servicio desplegado exitosamente en Cloud Run${NC}"
else
    echo -e "${RED}Error: No se pudo desplegar el servicio en Cloud Run${NC}"
    exit 1
fi

# Mensaje final de éxito
echo -e "${GREEN}¡Configuración completada exitosamente!${NC}"
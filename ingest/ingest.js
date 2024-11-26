const express = require('express');
const {BigQuery} = require('@google-cloud/bigquery');
const dotenv = require('dotenv');
const cors = require('cors');

// Cargar variables de entorno
dotenv.config();

const app = express();

// Configurar CORS para permitir todas las peticiones
app.use(cors({
    origin: '*',  // Permite peticiones desde cualquier origen
    methods: ['GET', 'POST'],  // Métodos permitidos
}));

app.use(express.json());

// Inicializar BigQuery
const bigquery = new BigQuery();

app.post('/ingest', async (req, res) => {
    try {
        // Obtiene los datos enviados en el cuerpo de la petición HTTP POST
        const payload = req.body;
        
        // Añadir timestamp
        const row = {
            ...payload,
            timestamp: new Date().toISOString()
        };

        // Configurar los parámetros de BigQuery
        const project = bigquery.dataset(process.env.BIGQUERY_PROJECT_ID);
        const dataset = project.dataset(process.env.BIGQUERY_DATASET_ID);
        const table = dataset.table(process.env.BIGQUERY_TABLE_ID);

        // Insertar los datos en BigQuery
        await table.insert([row]);

        res.status(200).json({
            success: true,
            message: 'Data ingested successfully'
        });

    } catch (error) {
        console.error('Error ingesting data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
const express = require('express');
const {BigQuery} = require('@google-cloud/bigquery');
const dotenv = require('dotenv');
const cors = require('cors');
const { VertexAI } = require('@google-cloud/vertexai');

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

// Configuración de Vertex AI
const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'europe-west4';
const vertexAI = new VertexAI({ project: projectId, location });

// Configuración del modelo
const MODEL_NAME = process.env.VERTEX_MODEL || 'gemini-1.5-pro-002';
const DEFAULT_PROMPT = process.env.PROMPT || `You are a JSON processor that performs sentiment analysis on text within JSON objects.  Your input will be a JSON object with a "comments" array. Each object in the array has a "texto" field containing text. You will analyze the sentiment of the text in each "texto" field and add a corresponding "label" field to the object. The "label" should be one of the following: 'positive', 'neutral', or 'negative'.

**Process:**

1. **Parse** the input JSON.
2. **Iterate** through the "comments" array.
3. For each object in the array:
    * **Analyze** the sentiment of the text in the "texto" field.
    * **Assign** a "label" field to the object with the appropriate sentiment value ('positive', 'neutral', or 'negative').
4. **Return** a valid JSON object with the modified "comments" array including the added "label" fields.  Maintain the original structure and content of the input JSON, only adding the "label" fields.


**Example Input:**

{
  "comments": [
    {"texto":"This is great!"},
    {"texto":"I feel indifferent."},
    {"texto":"Terrible experience."}
  ]
}

**Example Output:**

{
  "comments": [
    {"texto":"This is great!","label":"positive"},
    {"texto":"I feel indifferent.","label":"neutral"},
    {"texto":"Terrible experience.","label":"negative"}
  ]
}`;

// Añadir el nuevo prompt por defecto para replies después de DEFAULT_PROMPT
const DEFAULT_PROMPT_REPLY = `You are a helpful and harmless AI assistant designed to generate replies to comments on social media posts. You will receive a JSON object containing the context of a company, the text of a social media post, and an array of comments related to that post.  Your task is to analyze each comment and generate a concise and relevant reply in the same language as the comment.  You should consider the provided 'company_context' and 'post_text' when formulating your replies.

**Input JSON Format:**

{
  "company_context": "string describing the company and its values",
  "post_text": "string containing the text of the social media post",
  "comments": [
    {"texto": "comment text 1"},
    {"texto": "comment text 2"},
    {"texto": "comment text 3"}
  ]
}

**Output JSON Format:**
{
  "comments": [
    {
      "texto": "comment text 1",
      "reply": "reply to comment 1"
    },
    {
      "texto": "comment text 2",
      "reply": "reply to comment 2"
    },
    {
      "texto": "comment text 3",
      "reply": "reply to comment 3"
    }
  ]
}

Generate ONLY a valid JSON response following the output format.`;

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
        const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET_ID);
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

app.post('/predict', async (req, res) => {
  try {
    // Validar el payload
    if (!req.body || !req.body.comments || !Array.isArray(req.body.comments)) {
      return res.status(400).json({
        error: 'Invalid payload. Must include "comments" array'
      });
    }

    // Validar que cada comentario tenga el campo "texto"
    const invalidComments = req.body.comments.some(comment => !comment.texto);
    if (invalidComments) {
      return res.status(400).json({
        error: 'Each comment must have a "texto" field'
      });
    }

    // Inicializar el modelo
    const model = vertexAI.preview.getGenerativeModel({
      model: MODEL_NAME
    });

    // Preparar el prompt con el input
    const prompt = process.env.VERTEX_PROMPT || DEFAULT_PROMPT;
    const input = JSON.stringify(req.body, null, 2);
    
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ 
          text: `${prompt}\n\nAnalyze this input and return ONLY a valid JSON response:\n${input}`
        }]
      }],
      generationConfig: {
        temperature: 0.1,  // Reducir la creatividad
        topP: 0.8,
        topK: 40,
      }
    });

    const response = result.response;
    const textContent = response.candidates[0].content.parts[0].text;

    // Limpiar la respuesta de posibles markdown code blocks
    const cleanedContent = textContent.replace(/```json\n?|\n?```/g, '').trim();

    // Intentar parsear la respuesta como JSON
    try {
      const jsonResponse = JSON.parse(cleanedContent);
      res.json(jsonResponse);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      res.status(500).json({
        error: 'Error processing AI response',
        details: textContent
      });
    }

  } catch (error) {
    console.error('Error in /predict endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.post('/replies', async (req, res) => {
  try {
    // Validar el payload
    if (!req.body || !req.body.comments || !Array.isArray(req.body.comments) || 
        !req.body.company_context || !req.body.post_text) {
      return res.status(400).json({
        error: 'Invalid payload. Must include "company_context", "post_text" and "comments" array'
      });
    }

    // Validar que cada comentario tenga el campo "texto"
    const invalidComments = req.body.comments.some(comment => !comment.texto);
    if (invalidComments) {
      return res.status(400).json({
        error: 'Each comment must have a "texto" field'
      });
    }

    // Inicializar el modelo
    const model = vertexAI.preview.getGenerativeModel({
      model: MODEL_NAME
    });

    // Preparar el prompt con el input
    const prompt = process.env.VERTEX_PROMPT_REPLY || DEFAULT_PROMPT_REPLY;
    const input = JSON.stringify(req.body, null, 2);
    
    const result = await model.generateContent({
      contents: [{ 
        role: 'user', 
        parts: [{ 
          text: `${prompt}\n\nAnalyze this input and return ONLY a valid JSON response:\n${input}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,  // Un poco más de creatividad para las respuestas
        topP: 0.8,
        topK: 40,
      }
    });

    const response = result.response;
    const textContent = response.candidates[0].content.parts[0].text;

    // Limpiar la respuesta de posibles markdown code blocks
    const cleanedContent = textContent.replace(/```json\n?|\n?```/g, '').trim();

    // Intentar parsear la respuesta como JSON
    try {
      const jsonResponse = JSON.parse(cleanedContent);
      res.json(jsonResponse);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      res.status(500).json({
        error: 'Error processing AI response',
        details: textContent
      });
    }

  } catch (error) {
    console.error('Error in /replies endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
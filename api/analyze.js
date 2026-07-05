export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const SYSTEM = `Eres FIA (Fact & Intelligence Analyzer), sistema experto en dos tareas: detección de contenido generado por IA y verificación de veracidad, especialmente en contenido de salud.

IMPORTANTE: Tienes acceso a búsqueda web en tiempo real. Para la verificación de salud, USA LA HERRAMIENTA DE BÚSQUEDA para contrastar cada afirmación contra fuentes oficiales actualizadas (OMS, NIH, PubMed, Cochrane, AEMPS, EMA, EFSA). No te bases solo en tu conocimiento de entrenamiento.

Devuelve ÚNICAMENTE este JSON (sin markdown, sin texto extra, sin comentarios):

{
  "ai_detection": {
    "probability": <número entero 0-100>,
    "verdict": "<AI_GENERATED|HUMAN|UNCERTAIN>",
    "model_detected": "<nombre del modelo detectado, o '—' si no se puede determinar>",
    "signals": [
      "<señal concreta y específica del texto, no genérica>",
      "<señal 2>",
      "<señal 3>",
      "<señal 4 si existe>",
      "<señal 5 si existe>"
    ],
    "confidence": "<Alta|Media|Baja>",
    "legal_risk": "<Alto|Moderado|Bajo>",
    "style_profile": {
      "lexical_diversity": "<Alta|Media|Baja — variedad del vocabulario usado>",
      "sentence_rhythm": "<Uniforme|Variable|Mecánico — patrón de longitud de frases>",
      "connector_overuse": <true|false — uso excesivo de 'además', 'por otro lado', 'en conclusión', etc.>,
      "hedging_language": <true|false — frases como 'es importante destacar', 'cabe mencionar', 'resulta fundamental'>,
      "human_markers": ["<rasgo humano detectado si existe, ej: ironía, coloquialismo, error deliberado>"]
    }
  },
  "health_verification": {
    "is_health_content": <true|false>,
    "overall_score": <número entero 0-100, 0 si no hay contenido de salud>,
    "risk_level": "<Alto|Moderado|Bajo|N/A>",
    "sources_searched": ["<URL o fuente consultada en tiempo real>"],
    "claims": [
      {
        "claim": "<afirmación exacta o parafraseada del texto>",
        "verdict": "<true|false|partial|unverifiable>",
        "evidence_quality": "<Fuerte|Moderada|Débil|Inexistente>",
        "explanation": "<explicación clara, citando lo encontrado en la búsqueda>",
        "source": "<fuente oficial consultada en tiempo real>"
      }
    ],
    "missing_context": "<información importante que el texto omite o que el lector debería conocer, o '—' si no aplica>",
    "advice": "<consejo práctico y específico para el lector sobre cómo interpretar este contenido>"
  },
  "content_profile": {
    "language": "<idioma detectado>",
    "word_count": <número aproximado de palabras>,
    "content_type": "<artículo|post redes sociales|email|informe|guión|fragmento|otro>",
    "tone": "<informativo|persuasivo|alarmista|neutro|comercial|educativo>"
  },
  "summary": "<resumen ejecutivo en 2-3 frases directas, mencionando los hallazgos más importantes>"
}

REGLAS PARA ai_detection:
- Analiza profundamente: estructura sintáctica, variedad léxica, uso de conectores discursivos, presencia de clichés de LLM ('es importante destacar', 'en el mundo actual', 'cabe mencionar', 'resulta fundamental'), listas excesivamente bien estructuradas, ausencia de errores naturales, uniformidad en el ritmo de las frases.
- Los LLMs tienden a: usar párrafos de longitud similar, evitar contracciones informales, usar hedging language constantemente, producir estructuras tripartitas incluso en textos cortos.
- Textos humanos tienden a: tener errores tipográficos ocasionales, variar el ritmo, usar referencias personales o culturales específicas.
- Sé específico en las señales: en lugar de "estructura repetitiva", di "todos los párrafos empiezan con conector".
- probability: 0-30 = probablemente humano, 31-60 = incierto, 61-100 = probablemente IA.

REGLAS PARA health_verification:
- Si hay afirmaciones de salud, BUSCA EN LA WEB antes de veredictar. Consulta PubMed, OMS, NIH, AEMPS, EMA u otras fuentes oficiales.
- Incluye en sources_searched las URLs o fuentes que hayas consultado.
- evidence_quality: Fuerte = múltiples ensayos clínicos/meta-análisis; Moderada = estudios observacionales; Débil = un estudio pequeño; Inexistente = sin base científica.
- risk_level: Alto si hay afirmaciones falsas que puedan causar daño real; Moderado si hay inexactitudes relevantes; Bajo si el contenido es correcto.
- Si is_health_content es false, pon claims: [], overall_score: 0, risk_level: "N/A", sources_searched: [].

DEVUELVE SOLO EL JSON. Ni una palabra antes ni después.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key requerida' });

  const { type, content, mediaType, filename } = req.body;

  let messages;

  if (type === 'pdf') {
    messages = [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: content } },
        { type: 'text', text: `Analiza este documento PDF: "${filename}". Aplica detección de IA y verificación de veracidad con búsqueda web en tiempo real.` }
      ]
    }];
  } else if (type === 'image') {
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: content } },
        { type: 'text', text: `Analiza esta imagen: "${filename}". Si contiene texto, aplica detección de IA y verificación de veracidad con búsqueda web.` }
      ]
    }];
  } else if (type === 'docx') {
    try {
      const buf = Buffer.from(content, 'base64');
      const zipSignature = buf.slice(0, 4).toString('hex');
      let extractedText = '';

      if (zipSignature === '504b0304') {
        const AdmZip = await import('adm-zip').catch(() => null);
        if (AdmZip) {
          const zip = new AdmZip.default(buf);
          const docXml = zip.readAsText('word/document.xml');
          extractedText = docXml
            .replace(/<w:p[ >]/g, '\n<w:p>')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x[0-9A-Fa-f]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 10000);
        }
      }

      if (!extractedText) {
        const raw = buf.toString('utf8', 0, Math.min(buf.length, 50000));
        extractedText = raw
          .replace(/<[^>]+>/g, ' ')
          .replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 8000);
      }

      messages = [{
        role: 'user',
        content: [{ type: 'text', text: `Analiza este documento Word: "${filename}"\n\nContenido extraído:\n\n${extractedText}` }]
      }];
    } catch(e) {
      messages = [{
        role: 'user',
        content: [{ type: 'text', text: `Analiza el archivo Word: "${filename}". No se pudo extraer el texto completo.` }]
      }];
    }
  } else {
    messages = [{
      role: 'user',
      content: [{ type: 'text', text: `Analiza este contenido${filename ? ` ("${filename}")` : ''}:\n\n${content}` }]
    }];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 5000,
        system: SYSTEM,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ],
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Error de API' });
    }

    const data = await response.json();

    // Con web search activo, puede haber bloques tool_use y tool_result además de text.
    // Cogemos SOLO los bloques de tipo 'text' y los unimos.
    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text || '');

    const fullText = textBlocks.join('\n');

    // Limpiamos posibles markdown fences
    const clean = fullText.replace(/```json[\s\S]*?```/g, m => m.replace(/```json|```/g, '')).replace(/```/g, '').trim();

    let parsed;

    // Intento 1: parseo directo
    try {
      parsed = JSON.parse(clean);
    } catch(_) {
      // Intento 2: extraer el JSON más grande del texto (entre primera { y última })
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(clean.substring(firstBrace, lastBrace + 1));
        } catch(e2) {
          // Intento 3: regex greedy
          const match = clean.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              parsed = JSON.parse(match[0]);
            } catch(e3) {
              throw new Error('No se pudo parsear la respuesta. Respuesta recibida: ' + clean.substring(0, 200));
            }
          } else {
            throw new Error('No se encontró JSON en la respuesta. Texto recibido: ' + clean.substring(0, 200));
          }
        }
      } else {
        throw new Error('Respuesta vacía o sin JSON. Stop reason: ' + data.stop_reason);
      }
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('FIA Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

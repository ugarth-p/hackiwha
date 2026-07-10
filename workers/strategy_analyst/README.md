# Agent 2 — Analysis + Strategy

Takes market + competitor research (from Agent 1) and produces a competitive analysis and a grounded growth strategy in one structured JSON response, powered by Gemini.

## Setup

```bash
pip install -r requirements.txt
```

Copy `.env` and add your API key:

```
GEMINI_API_KEY=your_key_here
```

Get a key at https://aistudio.google.com/apikey

## Testing

There are 3 ways to test this project, from fastest to most complete:

### 1. Standalone script (fastest)

```bash
python agent2_service.py
```

Loads `sample_agent1_output.json` and `pattern_library.json` automatically, calls Gemini, validates the response, and prints the result.

**What to look for:**
- Output is valid JSON with `analysis` and `strategy` keys
- `analysis` contains `market_position`, `swot` (with `opportunities` and `threats` that have `title` fields), and `competitor_gaps`
- `strategy` is a list of 5-7 items, each with `pattern`, `description`, `cites`, and `expected_impact`
- Every `cites` value matches an `opportunity.title` or `threat.title` from the analysis
- Every `pattern` value matches a name from `pattern_library.json`

### 2. FastAPI + curl

Start the server:

```bash
uvicorn main:app --reload
```

Then in a separate terminal, run:

```bash
curl -X POST http://localhost:8000/agent2/run \
  -H "Content-Type: application/json" \
  -d @sample_request.json
```

To build `sample_request.json`, combine the contents of `sample_agent1_output.json`'s top-level fields with the `patterns` array from `pattern_library.json` into one object. Or use this shortcut:

```bash
python -c "
import json
from pathlib import Path
data = json.loads(Path('sample_agent1_output.json').read_text())
patterns = json.loads(Path('pattern_library.json').read_text())['patterns']
data['patterns'] = patterns
Path('sample_request.json').write_text(json.dumps(data, indent=2))
print('sample_request.json created')
"
```

**What to look for:**
- HTTP 200 response with JSON body
- Response matches the `Agent2Output` schema (check by eye or paste into a JSON validator)
- No 500 errors (which would mean validation or Gemini call failed)

### 3. Health check

```bash
curl http://localhost:8000/health
```

Should return `{"status": "ok"}`.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ERROR: Set the GEMINI_API_KEY environment variable` | API key not set | Add your key to `.env` file |
| `403 Forbidden` or `API key not valid` | Wrong or expired API key | Get a new key at https://aistudio.google.com/apikey |
| `ValidationError` in output | Gemini returned JSON that doesn't match the schema | Should auto-retry once; if it fails twice, check that the input data is well-formed |
| `500` from FastAPI | Internal error in `run_agent2` | Check terminal output for the full traceback |
| `Connection refused` on curl | Server not running | Make sure `uvicorn main:app --reload` is running |

## Expected output (abbreviated)

```json
{
  "analysis": {
    "market_position": "FreelanceFlow occupies a strong niche position...",
    "swot": {
      "strengths": ["...", "..."],
      "weaknesses": ["...", "..."],
      "opportunities": [
        {
          "title": "Growing Freelancer Workforce",
          "description": "..."
        }
      ],
      "threats": [
        {
          "title": "Enterprise Tools Moving Downmarket",
          "description": "..."
        }
      ]
    },
    "competitor_gaps": [
      {"competitor": "Asana", "gap": "..."},
      {"competitor": "Trello", "gap": "..."},
      {"competitor": "Bonsai", "gap": "..."}
    ]
  },
  "strategy": [
    {
      "pattern": "freemium-gate",
      "description": "...",
      "cites": "Growing Freelancer Workforce",
      "expected_impact": "..."
    }
  ]
}
```

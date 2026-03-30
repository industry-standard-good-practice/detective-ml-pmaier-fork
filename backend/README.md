# DetectiveML Backend (Python/FastAPI)

A Python-based backend for DetectiveML, built with **FastAPI** and powered by **Google Gemini AI** for case generation, suspect interrogation, image generation, and text-to-speech.

## Architecture

| Layer | Technology |
|-------|-----------|
| **Framework** | FastAPI (async ASGI) |
| **Server** | Uvicorn |
| **AI** | Google Gemini SDK (`google-genai`) |
| **Auth** | Firebase Admin SDK (ID token verification) |
| **Database** | Firebase Realtime Database |
| **Storage** | Firebase Cloud Storage |
| **Deployment** | Cloud Run / Cloud Functions (2nd gen) |

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── env.py               # .env / .env.local loader
│   ├── middleware/
│   │   └── auth.py          # Firebase ID token verification
│   ├── routes/
│   │   ├── cases.py         # CRUD operations for cases
│   │   ├── gemini.py        # AI endpoints (chat, images, generation)
│   │   ├── stats.py         # Game stats and voting
│   │   └── images.py        # Image upload to Firebase Storage
│   └── services/
│       ├── gemini_client.py          # Centralized GenAI client
│       ├── gemini_models.py          # Model IDs and fallback logic
│       ├── gemini_styles.py          # Style constants and reference image
│       ├── gemini_chat.py            # Suspect interrogation AI
│       ├── gemini_images.py          # Image generation pipeline
│       ├── gemini_tts.py             # Text-to-speech generation
│       ├── gemini_case.py            # Case helpers, voice styles, enforce*
│       ├── gemini_case_prompts.py    # Prompt rules and JSON schemas
│       ├── gemini_case_core.py       # Core AI functions (generate/edit/check)
│       ├── victim_portrait_key.py    # Body region inference
│       └── evidence_reveal_mapping.py # Fuzzy evidence title matching
├── function.py             # Cloud Functions entry point
├── requirements.txt        # Python dependencies
├── Dockerfile              # Container image for Cloud Run
├── .env                    # Static config (committed)
├── .env.local              # Secrets (gitignored)
├── openapi.yaml            # API specification
└── package.json            # npm run scripts (delegates to uvicorn)
```

## Quick Start

```bash
# 1. Create virtual environment
cd backend
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your GEMINI_API_KEY, FIREBASE_SA_KEY_PATH, etc.

# 4. Start development server
npm run dev
# → http://localhost:4000
```

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start uvicorn with auto-reload on port 4000 |
| `npm run start` | Start uvicorn in production mode on PORT (default 8080) |
| `npm run setup` | Create venv and install all dependencies |
| `npm run lint` | Compile-check the main module |

## API Endpoints

All endpoints except `/api/health` require a valid Firebase ID token in the `Authorization: Bearer <token>` header.

### Cases
- `GET /api/cases` — List all user cases
- `GET /api/cases/public` — List public cases
- `GET /api/cases/:id` — Get a specific case
- `POST /api/cases` — Create/update a case
- `DELETE /api/cases/:id` — Delete a case
- `POST /api/cases/:id/upload` — Publish to gallery

### AI (Gemini)
- `POST /api/gemini/generate-case` — Generate a new case
- `POST /api/gemini/check-consistency` — Run consistency check
- `POST /api/gemini/edit-case` — AI-driven case editing
- `POST /api/gemini/chat` — Suspect interrogation
- `POST /api/gemini/officer-chat` — Officer radio chat
- `POST /api/gemini/partner-intervention` — Good/bad cop
- `POST /api/gemini/bad-cop-hint` — Tactical hint
- `POST /api/gemini/summary` — End-game summary
- `POST /api/gemini/generate-image` — Generate an image
- `POST /api/gemini/edit-image` — Edit an existing image
- `POST /api/gemini/generate-emotional-variants` — Emotional portraits
- `POST /api/gemini/generate-portrait-variant` — Single variant
- `POST /api/gemini/regenerate-suspect` — Full suspect regen
- `POST /api/gemini/generate-neutral-portrait` — Neutral only
- `POST /api/gemini/upload-suspect-image` — Upload → pixel art
- `POST /api/gemini/pregenerate-images` — Full case pipeline
- `POST /api/gemini/generate-evidence-image` — Evidence card
- `POST /api/gemini/tts` — Text-to-speech

### Stats
- `GET /api/stats` — All case stats
- `GET /api/stats/:id` — Single case stats
- `POST /api/stats/:id/results` — Record game result
- `GET /api/stats/:id/vote` — Get user's vote
- `POST /api/stats/:id/vote` — Submit vote

### Images
- `POST /api/images/upload` — Upload base64 image

### Health
- `GET /api/health` — Health check

## Deployment

See [DEPLOY.md](./DEPLOY.md) for production deployment instructions.

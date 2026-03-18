# RHYTHMIQ

## Setup

1. **Clone the repository**
2. **Environment Variables**: Copy the `.env` files and fill in your API keys:

### Backend (.env in backend/ folder)
```bash
GOOGLE_CLIENT_ID=your_google_client_id_here
OPENAI_API_KEY=your_openai_api_key_here
YOUTUBE_API_KEY=your_youtube_api_key_here
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=your_sender_email@domain.com
ADMIN_EMAILS=admin@example.com
```

### Frontend (.env in frontend/ folder)
```bash
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID
3. Add `http://localhost:3000` to authorized origins
4. Add `http://localhost:3000` to authorized redirect URIs
5. Copy the Client ID to both `.env` files

## Local run

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python server.py
```

Frontend:

```powershell
cd frontend
npm install
npm start
```

The frontend defaults to `http://localhost:8000` for the backend in local development.

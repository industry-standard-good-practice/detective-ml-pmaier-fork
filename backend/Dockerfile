FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY function.py .
COPY .env .env
COPY assets/ ./assets/ 2>/dev/null || true

# Cloud Run uses PORT env var
ENV PORT=8080

EXPOSE 8080

CMD ["uvicorn", "app.main:fastapi_app", "--host", "0.0.0.0", "--port", "8080"]

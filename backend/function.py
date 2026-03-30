"""
Google Cloud Functions entry point.
Wraps the FastAPI app for Cloud Functions (2nd gen) / Cloud Run.
Deploy with: gcloud functions deploy api --runtime python312 --entry-point api
"""
import functions_framework
from app.main import fastapi_app

# Register the ASGI app as a Cloud Function HTTP handler
@functions_framework.http
def api(request):
    """Cloud Function HTTP entry point — delegates to FastAPI via ASGI adapter."""
    # For Cloud Functions, we use the WSGI adapter approach
    # In practice, Cloud Run is preferred for ASGI apps
    from starlette.testclient import TestClient
    client = TestClient(fastapi_app, raise_server_exceptions=False)

    # Forward the request
    headers = dict(request.headers)
    method = request.method.lower()
    url = request.path
    if request.query_string:
        url += f"?{request.query_string.decode('utf-8')}"

    handler = getattr(client, method, client.get)
    try:
        body = request.get_data(as_text=True) or None
        content_type = request.content_type or ""
        req_headers = {k: v for k, v in headers.items() if k.lower() not in ("host", "content-length")}

        if "json" in content_type and body:
            import json
            response = handler(url, json=json.loads(body), headers=req_headers)
        elif body:
            response = handler(url, content=body, headers=req_headers)
        else:
            response = handler(url, headers=req_headers)

        return (response.text, response.status_code, dict(response.headers))
    except Exception as e:
        import json
        return (json.dumps({"error": str(e)}), 500, {"Content-Type": "application/json"})

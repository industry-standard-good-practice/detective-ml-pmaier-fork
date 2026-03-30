"""Centralized Google GenAI client instance."""
import os
from google.genai import Client as GoogleGenAI

api_key = os.environ.get("GEMINI_API_KEY", "")
if not api_key:
    print("[Gemini] WARNING: GEMINI_API_KEY is not set. Gemini endpoints will fail.")

ai = GoogleGenAI(api_key=api_key)

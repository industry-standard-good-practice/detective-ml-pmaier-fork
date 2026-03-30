"""
Load environment variables from .env and .env.local files.
Import this module before any other app module to ensure env vars are available.
"""
from dotenv import load_dotenv
import os

# Load static configuration committed to git
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Load secrets from gitignored .env.local, overriding any conflicts
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

import chromadb
from .config import settings

_client = None

def get_collection(name: str = "policy_announcements"):
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    return _client.get_or_create_collection(name)

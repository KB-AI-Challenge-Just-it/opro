from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str = ""
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "bizagent"
    postgres_user: str = "bizagent"
    postgres_password: str = "changeme"
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    embedding_model: str = "BAAI/bge-m3"   # 한국어 포함 다국어 임베딩 (1024-dim, prefix 불필요)
    ecos_api_key: str = ""
    sbiz_api_key: str = ""
    bizinfo_crtfc_key: str = ""

    # 모델 배분 — 다이어그램의 비용/품질 라우팅
    model_screening: str = "claude-haiku-4-5-20251001"   # L2 1차 스크리닝(선택)
    model_query_transform: str = "claude-haiku-4-5-20251001"  # L4 쿼리 변환
    model_reasoning: str = "claude-sonnet-4-6"           # L3 원인 분석
    model_report: str = "claude-sonnet-4-6"              # L5 리포트 생성

    @property
    def pg_dsn(self) -> str:
        return (f"host={self.postgres_host} port={self.postgres_port} "
                f"dbname={self.postgres_db} user={self.postgres_user} "
                f"password={self.postgres_password}")

    class Config:
        env_file = ".env"

settings = Settings()

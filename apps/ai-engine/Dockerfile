FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
# torch를 CPU 전용 인덱스에서 먼저 설치 — sentence-transformers가 끌어오는 기본 torch는
# GPU 없는 컨테이너에도 CUDA 라이브러리(nvidia-cublas 등)를 포함해 2~3GB가 추가로 받아진다.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
# 임베딩 모델(bge-m3, ~2.3GB)을 빌드 타임에 이미지에 구워넣는다 — 런타임(컨테이너 최초 기동)에
# HuggingFace Hub 네트워크 다운로드에 의존하지 않도록 해서, 헬스체크 지연/네트워크 장애로
# 처음 보는 환경(심사위원 PC 등)에서 기동이 막히는 문제를 없앤다.
# hf-cache 볼륨과 동일 경로(/root/.cache/huggingface)에 저장되므로 볼륨 마운트 시에도 그대로 재사용된다.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

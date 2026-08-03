FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
# torch를 CPU 전용 인덱스에서 먼저 설치 — sentence-transformers가 끌어오는 기본 torch는
# GPU 없는 컨테이너에도 CUDA 라이브러리(nvidia-cublas 등)를 포함해 2~3GB가 추가로 받아진다.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

# bge-m3(~2.3GB)를 이미지에 미리 굽는다. 굽지 않으면 서버 첫 기동 때 huggingface.co에서
# 받아오느라 수 분이 걸리고(2코어에선 더), 대회 당일 외부 네트워크에 의존하게 된다.
# ⚠️ 이 때문에 배포 compose에서는 /root/.cache/huggingface 에 볼륨을 마운트하면 안 된다 —
#    빈 볼륨이 구워둔 모델을 가려버려 결국 다시 다운로드한다(굽기 vs 마운트, 둘 중 하나만).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"

COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

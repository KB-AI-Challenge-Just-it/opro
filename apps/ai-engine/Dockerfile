FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
# torch를 CPU 전용 인덱스에서 먼저 설치 — sentence-transformers가 끌어오는 기본 torch는
# GPU 없는 컨테이너에도 CUDA 라이브러리(nvidia-cublas 등)를 포함해 2~3GB가 추가로 받아진다.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

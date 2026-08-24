# Harmaal API — async FastAPI on Python 3.12
# NOTE: build context is the REPO ROOT (see docker-compose.yml) so we can copy
# both services/api and the shared/ migrations tree.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/api/pyproject.toml ./
COPY services/api/src ./src
RUN pip install --no-cache-dir .

COPY shared /shared
COPY services/api/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV PYTHONPATH=/app/src
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["./start.sh"]

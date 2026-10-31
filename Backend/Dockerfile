# syntax=docker/dockerfile:1
# One image for the API, the Celery worker and Celery beat (docker-compose.yml
# picks the command). Python 3.12 matches the pins in requirements.txt
# (googletrans/httpx/wsproto do not import on Python 3.13+).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NLTK_DATA=/usr/share/nltk_data

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# NLTK corpora (same list as build.sh)
RUN python -c "import nltk; [nltk.download(p, download_dir='/usr/share/nltk_data', quiet=True) for p in ('punkt','punkt_tab','stopwords','vader_lexicon','averaged_perceptron_tagger','wordnet')]"

COPY . .

RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app/uploads
USER app

ENV PORT=5000
EXPOSE 5000

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]

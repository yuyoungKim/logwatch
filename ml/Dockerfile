FROM python:3.11-slim

# Create a non-root user/group before touching the filesystem.
RUN groupadd --gid 1001 appgroup \
 && useradd  --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

# Install Python dependencies before copying source so Docker can cache
# the layer and skip reinstalling on source-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source.
COPY . .

# Drop to non-root for runtime.
USER appuser

EXPOSE 8000

# Health check uses the stdlib so no extra tooling is required in the image.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
    CMD python -c \
        "import urllib.request, sys; \
         r = urllib.request.urlopen('http://localhost:8000/health', timeout=4); \
         sys.exit(0 if r.status == 200 else 1)"

CMD ["python", "main.py"]

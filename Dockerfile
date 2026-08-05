FROM python:3.10-slim

# Install system dependencies required for OpenCV and dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies (this step compiles dlib and takes a few minutes)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose port 5000 for Flask/Gunicorn
EXPOSE 5000

# Run the application using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "2", "--timeout", "120", "app:app"]

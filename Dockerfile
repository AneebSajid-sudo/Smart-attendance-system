FROM continuumio/miniconda3

WORKDIR /app

# Install system dependencies required for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install pre-compiled face_recognition and dlib from conda-forge
# This bypasses the 8GB RAM C++ compilation step entirely!
RUN conda install -y -c conda-forge face_recognition

# Copy requirements
COPY requirements.txt .

# Install the rest of the Python dependencies via pip
# Pip will detect that face_recognition and dlib are already installed and skip them.
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose port 5000
EXPOSE 5000

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "2", "--timeout", "120", "app:app"]

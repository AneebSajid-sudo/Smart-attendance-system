FROM continuumio/miniconda3

WORKDIR /app

# Install system dependencies required for OpenCV and git for pip installs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pre-compiled face_recognition and dlib from conda-forge
# This bypasses the 8GB RAM C++ compilation step entirely!
RUN conda install -y -c conda-forge face_recognition

# Conda's version of face_recognition sometimes misses the actual model data files.
# We manually install the models directly from the author's github as requested by the error.
RUN pip install --no-cache-dir git+https://github.com/ageitgey/face_recognition_models

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

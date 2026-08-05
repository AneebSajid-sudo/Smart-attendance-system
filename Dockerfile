# Use the official pre-built image from the creator of the face_recognition library!
# This image contains Python, dlib, and face_recognition all pre-installed and fully tested.
# This completely bypasses compilation and guarantees the models are present.
FROM animcogn/face_recognition:cpu

WORKDIR /app

COPY requirements.txt .

# Install the remaining dependencies (Flask, Supabase DB driver, etc.)
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "2", "--timeout", "120", "app:app"]

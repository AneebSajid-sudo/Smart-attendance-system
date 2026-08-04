import face_recognition
import numpy as np
import pickle
import cv2
import base64

def _b64_to_rgb(b64_string):
    """
    Decode a base64 image string and return a proper uint8 RGB numpy array
    that face_recognition can consume, plus the original BGR frame.
    """
    if "," in b64_string:
        b64_string = b64_string.split(",")[1]

    img_bytes = base64.b64decode(b64_string)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)  # uint8 BGR

    if frame_bgr is None:
        return None, None

    # face_recognition requires uint8 RGB — explicit copy ensures contiguous array
    frame_rgb = np.ascontiguousarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB), dtype=np.uint8)
    return frame_rgb, frame_bgr

def encode_face_from_base64(b64_string):
    """
    Decode a base64 webcam snapshot, detect the largest face,
    return (encoding_bytes, bgr_frame) or (None, bgr_frame) if no face found.
    """
    frame_rgb, frame_bgr = _b64_to_rgb(b64_string)
    if frame_rgb is None:
        return None, None

    # Use HOG model (fast). num_jitters=1 for speed.
    locations = face_recognition.face_locations(frame_rgb, model="hog")
    if not locations:
        return None, frame_bgr

    # Pick largest face
    largest = max(locations, key=lambda loc: (loc[2] - loc[0]) * (loc[1] - loc[3]))
    encodings = face_recognition.face_encodings(frame_rgb, [largest], num_jitters=100)
    if not encodings:
        return None, frame_bgr

    return pickle.dumps(encodings[0]), frame_bgr

def find_duplicate_face(new_encoding_bytes, known_students, tolerance=0.5):
    """
    Check if the new face encoding too closely matches any existing student's face.
    Returns the matched student dictionary if duplicate is found, else None.
    """
    if not known_students or not new_encoding_bytes:
        return None
        
    try:
        new_enc = pickle.loads(new_encoding_bytes)
    except Exception:
        return None

    known_encs = []
    valid_students = []
    for s in known_students:
        try:
            known_encs.append(pickle.loads(bytes(s["encoding"])))
            valid_students.append(s)
        except Exception:
            pass

    if not known_encs:
        return None

    distances = face_recognition.face_distance(known_encs, new_enc)
    best_pos = int(np.argmin(distances))
    if distances[best_pos] <= tolerance:
        return valid_students[best_pos]
        
    return None

def recognize_faces_in_frame(b64_string, known_students, tolerance=0.55):
    """
    Recognize faces in a webcam frame against known students.
    Returns a list of faces with bounding boxes.
    """
    frame_rgb, frame_bgr = _b64_to_rgb(b64_string)
    if frame_rgb is None:
        return []

    # Resize to 50% for faster detection
    h, w = frame_rgb.shape[:2]
    small_rgb = np.ascontiguousarray(
        cv2.resize(frame_rgb, (w // 2, h // 2)), dtype=np.uint8
    )

    face_locations_small = face_recognition.face_locations(small_rgb, model="hog")
    if not face_locations_small:
        return []

    face_encodings = face_recognition.face_encodings(
        small_rgb, face_locations_small, num_jitters=1
    )

    # Scale locations back to full size
    face_locations = [(t * 2, r * 2, b * 2, l * 2) for (t, r, b, l) in face_locations_small]

    # Build known encodings list
    known_encodings = []
    for s in known_students:
        try:
            known_encodings.append(pickle.loads(bytes(s["encoding"])))
        except Exception:
            known_encodings.append(None)

    valid_pairs = [(i, e) for i, e in enumerate(known_encodings) if e is not None]

    faces_data = []
    for (top, right, bottom, left), face_enc in zip(face_locations, face_encodings):
        name = "Unknown"
        matched_student = None

        if valid_pairs:
            valid_idx, valid_encs = zip(*valid_pairs)
            distances = face_recognition.face_distance(list(valid_encs), face_enc)
            best_pos = int(np.argmin(distances))
            if distances[best_pos] <= tolerance:
                matched_student = known_students[valid_idx[best_pos]]
                name = matched_student["name"]

        faces_data.append({
            "name": name,
            "box": (top, right, bottom, left),
            "matched": bool(matched_student),
            "id": matched_student["id"] if matched_student else None,
            "student_id": matched_student["student_id"] if matched_student else None
        })

    return faces_data

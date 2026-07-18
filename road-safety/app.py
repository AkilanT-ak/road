import os
import joblib
import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "accident_model.pkl")
model = joblib.load(MODEL_PATH)

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")


@app.route("/")
def home():
    return render_template("index.html", google_api_key=GOOGLE_API_KEY)


@app.route("/get_traffic", methods=["POST"])
def get_traffic():
    data = request.get_json(force=True) or {}
    origin = data.get("origin", "Chennai")
    destination = data.get("destination", "Tambaram")

    if not GOOGLE_API_KEY:
        # No key configured - fall back to a neutral traffic estimate
        return jsonify({"traffic_level": 0.5, "note": "GOOGLE_API_KEY not set"})

    url = (
        "https://maps.googleapis.com/maps/api/directions/json"
        f"?origin={origin}&destination={destination}&departure_time=now&key={GOOGLE_API_KEY}"
    )
    try:
        resp = requests.get(url, timeout=8)
        directions = resp.json()
    except requests.RequestException:
        return jsonify({"traffic_level": 0.5, "note": "traffic lookup failed"})

    if directions.get("status") == "OK":
        leg = directions["routes"][0]["legs"][0]
        duration = leg["duration"]["value"]
        duration_in_traffic = leg.get("duration_in_traffic", {}).get("value", duration)
        traffic_level = (duration_in_traffic - duration) / duration if duration > 0 else 0
        return jsonify({"traffic_level": round(min(max(traffic_level, 0), 1), 2)})

    return jsonify({"traffic_level": 0.5, "note": directions.get("status", "unknown")})


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True) or {}
    speed = float(data.get("speed", 0))
    traffic = float(data.get("traffic_level", 0))

    risk = model.predict([[speed, traffic]])[0]

    probability = None
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba([[speed, traffic]])[0]
        probability = round(float(max(proba)), 2)

    return jsonify({"prediction": risk, "confidence": probability})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

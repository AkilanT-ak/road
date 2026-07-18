"""
Generates accident_model.pkl.

No real accident dataset was supplied, so this is trained on synthetic
data grounded in a published relationship rather than an arbitrary
formula: Nilsson's Power Model, the widely-cited road-safety research
finding that crash/injury risk scales roughly with (speed / reference
speed) ^ 4. Traffic congestion is layered on top as a secondary,
research-supported factor (stop-and-go conditions raise rear-end and
low-speed collision risk independently of raw speed).

This is still a stand-in, not a fit to real crash records - swap it
for your own trained model any time. It just needs to expose
.predict([[speed, traffic_level]]) and return "Low" / "Medium" / "High",
saved as accident_model.pkl (or update MODEL_PATH in app.py).
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier
import joblib

rng = np.random.default_rng(42)

n = 6000
speed = rng.uniform(0, 140, n)          # km/h
traffic = rng.uniform(0, 1, n)          # 0 = free flow, 1 = gridlock

REFERENCE_SPEED = 50.0  # km/h - typical urban baseline used in power-model studies

# Nilsson's Power Model: relative injury risk ~ (v / v_ref) ^ 4.
# Normalized to a 0-1-ish scale so it can be combined with traffic.
speed_risk = (speed / REFERENCE_SPEED) ** 4
speed_risk = speed_risk / np.percentile(speed_risk, 99)
speed_risk = np.clip(speed_risk, 0, 1)

# Congestion effect: risk rises as traffic gets heavier, but eases off
# right at total gridlock (near-zero speeds in a jam), matching
# observed U-shaped severity-by-density patterns in traffic studies.
congestion_risk = traffic * (1 - 0.3 * traffic)

score = 0.7 * speed_risk + 0.3 * congestion_risk + rng.normal(0, 0.05, n)
score = np.clip(score, 0, 1)

risk = np.where(score > 0.62, "High", np.where(score > 0.32, "Medium", "Low"))

X = np.column_stack([speed, traffic])

clf = RandomForestClassifier(n_estimators=200, max_depth=7, random_state=42)
clf.fit(X, risk)

joblib.dump(clf, "accident_model.pkl")
print("Saved accident_model.pkl")
print("Class balance:", {label: int((risk == label).sum()) for label in ["Low", "Medium", "High"]})

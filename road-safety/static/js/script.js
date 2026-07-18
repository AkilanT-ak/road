(function () {
  const form = document.getElementById("route-form");
  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");

  const needle = document.getElementById("needle");
  const riskText = document.getElementById("gauge-risk-text");
  const confidenceText = document.getElementById("gauge-confidence");
  const speedValue = document.getElementById("speed-value");
  const trafficValue = document.getElementById("traffic-value");
  const routeValue = document.getElementById("route-value");
  const statusPill = document.getElementById("status-pill");
  const statusText = document.getElementById("status-text");
  const mapFrame = document.getElementById("map");
  const mapEmpty = document.getElementById("map-empty");
  const googleApiKey = document.getElementById("google-api-key").textContent.trim();

  let watchId = null;
  let trafficPollId = null;
  let currentTrafficLevel = 0.5;
  let lastSpokenAt = 0;
  const SPEAK_COOLDOWN_MS = 20000;

  const RISK_ANGLE = { Low: 0, Medium: 0.5, High: 1 };

  function setNeedle(value) {
    const angle = (value - 0.5) * 180;
    needle.setAttribute("transform", `rotate(${angle} 120 120)`);
  }

  function setRisk(label, confidence) {
    riskText.textContent = label.toUpperCase();
    riskText.className = label.toLowerCase();
    confidenceText.textContent =
      confidence != null ? `Confidence ${Math.round(confidence * 100)}%` : "";
    setNeedle(RISK_ANGLE[label] ?? 0.5);

    if (label === "High") {
      maybeSpeak("Warning. High risk of accident. Slow down.");
    }
  }

  function maybeSpeak(message) {
    if (!("speechSynthesis" in window)) return;
    const now = Date.now();
    if (now - lastSpokenAt < SPEAK_COOLDOWN_MS) return;
    lastSpokenAt = now;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function getTrafficLevel(origin, destination) {
    try {
      const res = await fetch("/get_traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination }),
      });
      const data = await res.json();
      return typeof data.traffic_level === "number" ? data.traffic_level : 0.5;
    } catch (err) {
      return 0.5;
    }
  }

  async function predictRisk(speed, trafficLevel) {
    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed, traffic_level: trafficLevel }),
      });
      return await res.json();
    } catch (err) {
      return { prediction: "Medium", confidence: null };
    }
  }

  function updateMap(origin, destination) {
    if (!googleApiKey) {
      mapEmpty.textContent =
        "Map preview needs a GOOGLE_API_KEY set on the server. Route monitoring still works without it.";
      mapEmpty.style.display = "flex";
      mapFrame.classList.remove("visible");
      return;
    }
    const src = `https://www.google.com/maps/embed/v1/directions?key=${googleApiKey}&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}&mode=driving`;
    mapFrame.src = src;
    mapFrame.classList.add("visible");
    mapEmpty.style.display = "none";
  }

  function startTrafficPolling(origin, destination) {
    if (trafficPollId) clearInterval(trafficPollId);
    const poll = async () => {
      currentTrafficLevel = await getTrafficLevel(origin, destination);
      trafficValue.textContent = Math.round(currentTrafficLevel * 100);
    };
    poll();
    trafficPollId = setInterval(poll, 15000);
  }

  function startSpeedWatch() {
    if (!("geolocation" in navigator)) {
      speedValue.textContent = "n/a";
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);

    const isMobile = /Android|iPhone/i.test(navigator.userAgent);

    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        let speed;
        if (isMobile && position.coords.speed && position.coords.speed > 0.3) {
          speed = position.coords.speed * 3.6;
        } else {
          // No reliable speed sensor (e.g. desktop) - simulate a plausible reading
          speed = Math.random() * 60 + 20;
        }
        speed = Math.round(speed * 10) / 10;
        speedValue.textContent = speed.toFixed(1);

        const result = await predictRisk(speed, currentTrafficLevel);
        setRisk(result.prediction || "Medium", result.confidence);
      },
      (error) => {
        statusText.textContent = "Location unavailable";
        statusPill.classList.remove("live");
      },
      { enableHighAccuracy: true }
    );
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    if (!origin || !destination) return;

    routeValue.textContent = `${origin} \u2192 ${destination}`;
    updateMap(origin, destination);
    startTrafficPolling(origin, destination);
    startSpeedWatch();

    statusPill.classList.add("live");
    statusText.textContent = "Monitoring";
    riskText.textContent = "READING\u2026";
    riskText.className = "pending";
  });
})();

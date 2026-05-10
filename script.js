var map = L.map("map").setView([-5.1477, 119.4327], 13);
let tempMarker = null;
let currentConfig = null;

map.on("click", function (e) {
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;

  GEOFENCE_CENTER = [lat, lon];

  document.getElementById("geo_center").value =
    lat.toFixed(6) + ", " + lon.toFixed(6);

  if (tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker([lat, lon], {
    icon: geofenceIcon,
  }).addTo(map);

  updateGeofence();
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© Rizky Project",
}).addTo(map);

var carIcon = L.divIcon({
  html: '<div style="font-size:32px;">🚕</div>',
  iconSize: [30, 30],
  className: "",
});
var geofenceIcon = L.divIcon({
  html: "<div style='font-size:32px;'>📍</div>",
  iconSize: [30, 30],
  className: "",
});

var marker = L.marker([-5.1477, 119.4327], { icon: carIcon }).addTo(map);

// ================= GEOFENCE =================
let GEOFENCE_CENTER = [-5.1477, 119.4327];
let GEOFENCE_RADIUS = 10000;
let isInsideGeofence = null;

// ================= SWITCH =================
let geofenceEnabled = false;

const geofenceSwitch = document.getElementById("geofenceSwitch");

geofenceSwitch.addEventListener("change", function () {
  geofenceEnabled = this.checked;

  console.log(geofenceEnabled ? "Geofence Enabled" : "Geofence Disabled");

  if (geofenceEnabled) {
    map.addLayer(geofenceCircle);
  } else {
    map.removeLayer(geofenceCircle);
  }
});

// Circle visual (improved)
var geofenceCircle = L.circle(GEOFENCE_CENTER, {
  radius: GEOFENCE_RADIUS,
  color: "#ff0000", // warna border (merah)
  weight: 2, // ketebalan garis
  opacity: 0.8, // transparansi garis
  fillColor: "#f20c0c",
  fillOpacity: 0.2, // transparansi isi (semi transparan)
}).addTo(map);

// ================= MQTT =================
let client = null;

// ================= OPTIMASI NOMINATIM =================
let lastLat = null;
let lastLon = null;

// ================= HITUNG JARAK =================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ================= GEOFENCE CHECK =================
function checkGeofence(lat, lon) {
  // jika switch OFF maka geofence tidak dijalankan
  if (!geofenceEnabled) return;

  let distance = getDistance(lat, lon, GEOFENCE_CENTER[0], GEOFENCE_CENTER[1]);
  let inside = distance <= GEOFENCE_RADIUS;

  // Update warna circle
  geofenceCircle.setStyle({
    color: inside ? "green" : "red",
    fillColor: inside ? "green" : "red",
  });

  if (isInsideGeofence === null) {
    isInsideGeofence = inside;
    return;
  }

  // ================= PUBLISH FUNCTION =================
  function publishStatus(inside_bool, lat, lon) {
    if (!client?.connected) {
      console.log("MQTT not connected");
      return;
    }

    if (!currentConfig) {
      console.log("Config not loaded");
      return;
    }

    const payload = {
      inside: inside_bool,
      lat: lat,
      lon: lon,
    };

    client.publish(
      currentConfig.pub_topic, // ✅ FIX
      JSON.stringify(payload),
      { qos: 1, retain: false }, // ✅ lebih reliable
    );

    console.log("Published:", payload);
  }

  // ================= MASUK =================
  if (!isInsideGeofence && inside) {
    publishStatus(true, lat, lon); // ❗ false = tidak out_zone

    Swal.fire({
      icon: "success",
      title: "Inside Geofence",
      text: "The vehicle has entered the geofence",
      timer: 2000,
      showConfirmButton: false,
    });
  }

  // ================= KELUAR =================
  if (isInsideGeofence && !inside) {
    publishStatus(false, lat, lon);

    Swal.fire({
      icon: "warning",
      title: "Outside Geofence",
      text: "The vehicle has left the geofence",
      timer: 2000,
      showConfirmButton: false,
    });
  }

  isInsideGeofence = inside;
}

// ================= CONFIG =================
function loadConfig() {
  let config = JSON.parse(localStorage.getItem("mqtt_config"));

  if (!config) {
    config = {
      broker: "broker.emqx.io",
      port: 8084,
      pub_topic: "rizky/geo-alert",
      sub_topic: "esp32/rizky-sub",
    };
  }

  currentConfig = config;

  document.getElementById("broker").value = config.broker;
  document.getElementById("port").value = config.port;
  document.getElementById("pub_topic").value = config.pub_topic;
  document.getElementById("sub_topic").value = config.sub_topic;
  document.getElementById("geo_center").value =
    GEOFENCE_CENTER[0] + ", " + GEOFENCE_CENTER[1];
  document.getElementById("geo_radius").value = GEOFENCE_RADIUS;

  connectMQTT(config);
}

function updateGeofence() {
  geofenceCircle.setLatLng(GEOFENCE_CENTER);
  geofenceCircle.setRadius(GEOFENCE_RADIUS);
}

function saveConfig() {
  const broker = document.getElementById("broker").value;
  const port = document.getElementById("port").value;
  const pub_topic = document.getElementById("pub_topic").value;
  const sub_topic = document.getElementById("sub_topic").value;
  const geo_radius = document.getElementById("geo_radius").value;

  if (!broker || !port || !pub_topic || !sub_topic) {
    Swal.fire({
      icon: "warning",
      title: "Validation Failed",
      text: "All fields are required",
    });
    return;
  }

  // update radius jika diisi
  if (geo_radius) {
    GEOFENCE_RADIUS = parseFloat(geo_radius);
  }

  updateGeofence();

  const config = { broker, port, pub_topic, sub_topic };
  localStorage.setItem("mqtt_config", JSON.stringify(config));

  Swal.fire({
    icon: "success",
    title: "Success",
    text: "Configuration saved",
    timer: 1500,
    showConfirmButton: false,
  });

  if (client) client.end();
  connectMQTT(config);

  $("#configModal").modal("hide");
}

// ================= MQTT CONNECT =================
function connectMQTT(config) {
  // const url = `wss://${config.broker}:${config.port}/mqtt`;
  const url = "wss://broker.emqx.io:8084/mqtt";
  client = mqtt.connect(url);

  client.on("connect", () => {
    const statusEl = document.getElementById("status");

    statusEl.innerHTML = '<i class="fas fa-signal"></i> Connected';

    statusEl.classList.remove("badge-danger");
    statusEl.classList.add("badge-success");

    client.subscribe(config.sub_topic);
  });

  client.on("offline", () => {
    const statusEl = document.getElementById("status");

    statusEl.innerHTML = '<i class="fas fa-signal"></i> Disconnected';

    statusEl.classList.remove("badge-success");
    statusEl.classList.add("badge-danger");
  });

  client.on("message", (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      let lat = parseFloat(data.lat);
      let lon = parseFloat(data.lon);
      let alt = parseFloat(data.alt);
      let speed = parseFloat(data.speed);

      if (isNaN(lat) || isNaN(lon)) return;

      // Update map
      marker.setLatLng([lat, lon]);
      map.panTo([lat, lon]);

      // ===== GEOFENCE =====
      checkGeofence(lat, lon);

      // ===== SMART GEOCODING =====
      fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        {
          headers: { "User-Agent": "GPS-Tracker-App" },
        },
      )
        .then((res) => res.json())
        .then((res) => {
          let addr = res.address || {};

          let jalan =
            addr.road ||
            addr.pedestrian ||
            addr.residential ||
            addr.path ||
            addr.footway ||
            "Unknown Area";

          document.getElementById("location").innerText = jalan;
        })
        .catch(() => {
          document.getElementById("location").innerText = "Unknown Area";
        });

      // ===== UPDATE UI =====
      document.getElementById("lat").innerText = lat.toFixed(6);
      document.getElementById("lon").innerText = lon.toFixed(6);
      document.getElementById("alt").innerText = isNaN(alt)
        ? "-"
        : alt.toFixed(2);
      document.getElementById("speed").innerText = isNaN(speed)
        ? "-"
        : speed.toFixed(2);
    } catch (e) {
      console.log("Invalid JSON");
    }
  });

  client.on("error", () => {
    const statusEl = document.getElementById("status");
    statusEl.innerText = "Error";
    statusEl.classList.remove("badge-success");
    statusEl.classList.add("badge-danger");
  });

  client.on("close", () => {
    const statusEl = document.getElementById("status");
    statusEl.innerText = "Disconnected";
    statusEl.classList.remove("badge-success");
    statusEl.classList.add("badge-danger");
  });
}

// ================= INIT =================
loadConfig();
document.getElementById("geo_radius").addEventListener("input", function () {
  let val = parseFloat(this.value);
  if (!isNaN(val)) {
    GEOFENCE_RADIUS = val;
    updateGeofence();
  }
});

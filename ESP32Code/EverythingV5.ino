// === Tea Machine: System ON/OFF + Heating + Brew + Dispense + BLE (v1.3 water-level) ===
// UI/Commands (unchanged + 3 new):
//   SYS:ON / SYS:OFF
//   HEAT:START / HEAT:STOP
//   BREW:START / BREW:STOP
//   DISPENSE:TASTE (1.0s) / DISPENSE:CUP (2.5s) / DISPENSE:STOP
//   REFILLED
//   SET:FIRST_MIN=6 / SET:T0=420 / SET:TAU=90
//   SET:TEA=BLACK | SET:TEA=GREEN
//   NEW: SET:TANK=<ml>      // e.g., 1700
//   NEW: SET:FLOW=<ml_per_s>// e.g., 130
//
// Status JSON (~1 Hz, notify) now also includes water level:
//   {"sys":"ON|OFF","tea":"BLACK|GREEN","T":..,"heater":0/1,"heating":0/1,
//    "brew":"IDLE|LOWERING|SOAKING|RAISING|DONE","brew_ms":..,"brew_total":..,
//    "pump":0/1,"dispense":"NONE|TASTE|CUP","needs_refill":0/1,"event":"NONE",
//    "water_ml":..,"tank_pct":..}

#include <ESP32Servo.h>
#include <NimBLEDevice.h>
#include <math.h>

/* ===================== Pins & ADC ===================== */
const int PT_PIN    = 36;  // ADC1_CH0
const int SSR_PIN   = 25;  // Heater SSR (HIGH = ON)
const int SERVO_PIN = 27;  // Servo
const int PUMP_PIN  = 26;  // Pump relay input

// Relay is active-LOW (LOW = ON)
const bool RELAY_ACTIVE_LOW = true;

const float VREF = 5.0f;
const int   N_SAMPLES = 50;

/* ===================== LUT V->T ===================== */
float V_pts[] = {1.12f, 1.49f, 1.74f, 1.98f, 3.00f, 3.20f};
float T_pts[] = {21.0f, 31.0f, 43.0f, 49.0f, 95.0f,100.0f};
const int NPTS = sizeof(V_pts)/sizeof(V_pts[0]);

/* ===================== Tea Mode & Temp Targets ===================== */
enum TeaMode { TEA_BLACK, TEA_GREEN };
TeaMode teaMode = TEA_BLACK;   // default

// Per-tea temperature bands (°C). We convert to volt thresholds at runtime.
float T_ON_target_C  = 96.0f;  // lower bound (heater ON below this)
float T_OFF_target_C = 98.0f;  // upper bound (heater OFF above this)

// Derived from LUT:
float V_ON  = 0.0f, V_OFF = 0.0f;

// Min dwell to avoid chatter (ms)
const unsigned long MIN_ON_MS  = 4000;
const unsigned long MIN_OFF_MS = 4000;
unsigned long lastChangeMs = 0;

bool systemOn = false;
bool heatingOn = false;
bool heaterOn  = false;

/* ===================== Servo / Brew ===================== */
Servo myservo;
int   SERVO_NEUTRAL = 90;
const int SERVO_CW  = 0;    // down
const int SERVO_CCW = 180;  // up

const unsigned long LOWER_MS = 2500;
const unsigned long RAISE_MS = 2200;

// Brew timing parameters (first and model-based compensated)
int   first_min = 5;         // default set for BLACK; updated by tea mode
float t0_sec    = 300.0f;    // same as first_min; kept for your model
float tau_sec   = 90.0f;
const float r_dilution = 1.0f / 1.7f;

unsigned long soak_ms_first;
unsigned long soak_ms_postRefill;
bool useFirstSoak = true;
bool pendingRefillBrew = false;

enum BrewState { BREW_IDLE, BREW_LOWERING, BREW_SOAKING, BREW_RAISING, BREW_DONE };
BrewState brewState = BREW_IDLE;
unsigned long stateStartMs = 0;
unsigned long currentSoakMs = 0;

/* ===================== Pump / Refill ===================== */
bool pumpOn = false;
unsigned long pumpPulseEndMs = 0;
unsigned long cumulativePumpMs = 0;
bool needsRefill = false;
enum DispenseMode { DISP_NONE, DISP_TASTE, DISP_CUP };
DispenseMode dmode = DISP_NONE;

/* ===== Water level model (NEW) ===== */
float tank_capacity_ml = 1700.0f; // default: 1.7 L when you send REFILLED
float flow_ml_per_s    = 115.0f;  // default: ~8 L/min ~= 133 ml/s; tweak with SET:FLOW but actually its around 115ml per second

/* ===================== BLE ===================== */
#define TEA_SERVICE_UUID "0000A000-0000-1000-8000-00805F9B34FB"
#define CMD_CHAR_UUID    "0000A001-0000-1000-8000-00805F9B34FB"
#define STATE_CHAR_UUID  "0000A002-0000-1000-8000-00805F9B34FB"
NimBLEServer* pServer = nullptr;
NimBLECharacteristic* pCmdChar = nullptr;
NimBLECharacteristic* pStateChar = nullptr;
bool bleClientConnected = false;

/* ===================== Helpers ===================== */
float readVoltage() {
  long sum = 0;
  for (int i=0;i<N_SAMPLES;i++){ sum += analogRead(PT_PIN); delay(2); }
  float raw = sum / float(N_SAMPLES);
  return (raw / 4095.0f) * VREF;
}

float interpTemp(float V) {
  if (V <= V_pts[0]) return T_pts[0];
  for (int i=0;i<NPTS-1;i++){
    if (V <= V_pts[i+1]) {
      float t = (V - V_pts[i]) / (V_pts[i+1]-V_pts[i]);
      return T_pts[i] + t*(T_pts[i+1]-T_pts[i]);
    }
  }
  return T_pts[NPTS-1];
}

float interpVoltFromTemp(float T) {
  if (T <= T_pts[0]) return V_pts[0];
  for (int i=0;i<NPTS-1;i++){
    if (T <= T_pts[i+1]) {
      float t = (T - T_pts[i]) / (T_pts[i+1]-T_pts[i]);
      return V_pts[i] + t*(V_pts[i+1]-V_pts[i]);
    }
  }
  return V_pts[NPTS-1];
}

/* === Apply tea mode: sets temp targets, volt thresholds, and first-brew time === */
void applyTeaMode(TeaMode mode) {
  teaMode = mode;
  if (teaMode == TEA_BLACK) {
    T_ON_target_C  = 96.0f;
    T_OFF_target_C = 98.0f;
    first_min = 5;             // 5 minutes
    t0_sec    = 5.0f * 60.0f;
  } else { // TEA_GREEN
    T_ON_target_C  = 82.0f;
    T_OFF_target_C = 84.0f;
    first_min = 3;             // 3 minutes
    t0_sec    = 3.0f * 60.0f;
  }
  V_ON  = interpVoltFromTemp(T_ON_target_C);
  V_OFF = interpVoltFromTemp(T_OFF_target_C);

  soak_ms_first      = (unsigned long)first_min * 60UL * 1000UL;
  soak_ms_postRefill = (unsigned long)( (t0_sec + tau_sec * logf(1.0f - r_dilution + r_dilution * expf(-t0_sec / tau_sec))) * 1000.0f );
}

void setHeater(bool on){
  heaterOn = on;
  digitalWrite(SSR_PIN, on ? HIGH : LOW);
  lastChangeMs = millis();
}

// Pump OFF by default; active-low relay handled here
void setPump(bool on) {
  pumpOn = on;
  int level = on
      ? (RELAY_ACTIVE_LOW ? LOW  : HIGH)
      : (RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(PUMP_PIN, level);
}

void servoDown(){ myservo.write(SERVO_CW); }
void servoUp()  { myservo.write(SERVO_CCW); }
void servoStop(){ myservo.write(SERVO_NEUTRAL); }

unsigned long compute_tcomp_ms() {
  float tcomp = t0_sec + tau_sec * logf(1.0f - r_dilution + r_dilution * expf(-t0_sec / tau_sec));
  if (tcomp < 0) tcomp = 0;
  return (unsigned long)(tcomp * 1000.0f);
}

void safeShutdown(){
  heatingOn = false;
  setHeater(false);
  setPump(false);
  pumpPulseEndMs = 0;
  dmode = DISP_NONE;
  if (brewState != BREW_IDLE && brewState != BREW_DONE) {
    servoUp();
    delay(RAISE_MS);
  }
  servoStop();
  brewState = BREW_IDLE;
}

/* ===== Water math (NEW) ===== */
// Remaining water in the tank (ml), using pump-on time * flow rate.
// Resets when you send REFILLED (cumulativePumpMs reset there).
float getWaterMl() {
  float dispensed_ml = (cumulativePumpMs / 1000.0f) * flow_ml_per_s;
  float remaining = tank_capacity_ml - dispensed_ml;
  if (remaining < 0) remaining = 0;
  if (remaining > tank_capacity_ml) remaining = tank_capacity_ml;
  return remaining;
}

/* ===================== Brew FSM ===================== */
void startBrew(){
  if (useFirstSoak) {
    currentSoakMs = (unsigned long)first_min * 60UL * 1000UL;
  } else if (pendingRefillBrew) {
    currentSoakMs = soak_ms_postRefill;
  } else {
    currentSoakMs = (unsigned long)first_min * 60UL * 1000UL;
  }
  brewState = BREW_LOWERING;
  stateStartMs = millis();
  servoDown();
}

void stopBrew(){
  brewState = BREW_RAISING;
  stateStartMs = millis();
  servoUp();
}

void runBrewFSM(){
  unsigned long now = millis();
  switch (brewState){
    case BREW_IDLE: break;
    case BREW_LOWERING:
      if (now - stateStartMs >= LOWER_MS) {
        servoStop();
        brewState = BREW_SOAKING;
        stateStartMs = now;
      }
      break;
    case BREW_SOAKING:
      if (now - stateStartMs >= currentSoakMs) {
        brewState = BREW_RAISING;
        stateStartMs = now;
        servoUp();
      }
      break;
    case BREW_RAISING:
      if (now - stateStartMs >= RAISE_MS) {
        servoStop();
        brewState = BREW_DONE;
        useFirstSoak = false;
        if (pendingRefillBrew) pendingRefillBrew = false;
      }
      break;
    case BREW_DONE: break;
  }
}

/* ===================== BLE ===================== */
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override { bleClientConnected = true; }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    bleClientConnected = false; NimBLEDevice::startAdvertising();
  }
};

void doCommand(const String& cmdRaw){
  String cmd = cmdRaw; String up = cmd; up.trim(); up.toUpperCase();

  if (up == "SYS:ON") {
    systemOn = true;
  } else if (up == "SYS:OFF") {
    systemOn = false; safeShutdown();
  } else if (up == "HEAT:START") {
    if (systemOn) heatingOn = true;
  } else if (up == "HEAT:STOP") {
    heatingOn = false; setHeater(false);
  } else if (up == "BREW:START") {
    if (systemOn && (brewState == BREW_IDLE || brewState == BREW_DONE)) startBrew();
  } else if (up == "BREW:STOP") {
    if (brewState != BREW_IDLE && brewState != BREW_DONE) stopBrew();

  } else if (up == "DISPENSE:TASTE") {
    if (systemOn && !pumpOn) {
      setPump(true); dmode = DISP_TASTE;
      pumpPulseEndMs = millis() + 1000;
    }
  } else if (up == "DISPENSE:CUP") {
    if (systemOn && !pumpOn) {
      setPump(true); dmode = DISP_CUP;
      pumpPulseEndMs = millis() + 2500;
    }
  } else if (up == "DISPENSE:STOP") {
    setPump(false); pumpPulseEndMs = 0; dmode = DISP_NONE;

  } else if (up == "REFILLED") {
    cumulativePumpMs = 0; needsRefill = false;
    pendingRefillBrew = true;

  } else if (up.startsWith("SET:FIRST_MIN=")) {
    int val = up.substring(String("SET:FIRST_MIN=").length()).toInt();
    if (val > 0) first_min = val, soak_ms_first = (unsigned long)first_min * 60000UL;
  } else if (up.startsWith("SET:T0=")) {
    float v = up.substring(String("SET:T0=").length()).toFloat();
    if (v > 0) t0_sec = v;
  } else if (up.startsWith("SET:TAU=")) {
    float v = up.substring(String("SET:TAU=").length()).toFloat();
    if (v > 0) tau_sec = v;

  // === NEW: Tea mode selection ===
  } else if (up.startsWith("SET:TEA=")) {
    if (up.indexOf("GREEN") >= 0) {
      applyTeaMode(TEA_GREEN);
    } else {
      applyTeaMode(TEA_BLACK); // default/fallback
    }

  // === NEW: Water model calibration ===
  } else if (up.startsWith("SET:TANK=")) {
    float ml = up.substring(String("SET:TANK=").length()).toFloat();
    if (ml > 0.0f) tank_capacity_ml = ml;
  } else if (up.startsWith("SET:FLOW=")) {
    float mlps = up.substring(String("SET:FLOW=").length()).toFloat();
    if (mlps > 0.0f) flow_ml_per_s = mlps;
  }

  soak_ms_postRefill = compute_tcomp_ms(); // keep existing behaviour
}

class CmdCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    std::string v = c->getValue();
    String s = String(v.c_str());
    int start = 0;
    while (true) {
      int nl = s.indexOf('\n', start);
      String line = (nl<0)? s.substring(start) : s.substring(start, nl);
      line.trim();
      if (line.length()) doCommand(line);
      if (nl<0) break;
      start = nl+1;
    }
  }
};

void setupBLE(){
  NimBLEDevice::init("TeaMachine-001");
  NimBLEDevice::setDeviceName("TeaMachine-001");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  NimBLEService* svc = pServer->createService(TEA_SERVICE_UUID);

  pCmdChar   = svc->createCharacteristic(CMD_CHAR_UUID,   NIMBLE_PROPERTY::WRITE_NR);
  pStateChar = svc->createCharacteristic(STATE_CHAR_UUID, NIMBLE_PROPERTY::NOTIFY);
  pCmdChar->setCallbacks(new CmdCallbacks());
  svc->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData ad; ad.setCompleteServices(BLEUUID(TEA_SERVICE_UUID));
  NimBLEAdvertisementData sd; sd.setName("TeaMachine-001");
  adv->setAdvertisementData(ad); adv->setScanResponseData(sd);
  adv->start();
}

/* ===================== Setup / Loop ===================== */
void setup(){
  Serial.begin(115200); delay(300);

  pinMode(SSR_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);

  // Force pump OFF on startup
  digitalWrite(PUMP_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pumpOn = false;

  setHeater(false);

  analogReadResolution(12);
  analogSetPinAttenuation(PT_PIN, ADC_11db);

  myservo.attach(SERVO_PIN, 500, 2500);
  delay(100); servoStop();

  // Initialise with default tea mode (BLACK). This sets V_ON/V_OFF & first_min.
  applyTeaMode(TEA_BLACK);

  setupBLE();
}

void loop(){
  unsigned long now = millis();
  float V = readVoltage();
  float T = interpTemp(V);

  // Heating hysteresis with min dwell
  if (systemOn && heatingOn) {
    if (!heaterOn && V <= V_ON && (now - lastChangeMs >= MIN_OFF_MS)) setHeater(true);
    else if (heaterOn && V >= V_OFF && (now - lastChangeMs >= MIN_ON_MS)) setHeater(false);
  } else if (heaterOn) {
    setHeater(false);
  }

  runBrewFSM();

  static unsigned long lastTick = now;
  unsigned long dt = now - lastTick; lastTick = now;

  if (pumpOn) {
    if (pumpPulseEndMs && now >= pumpPulseEndMs) {
      setPump(false);
      if (dmode == DISP_CUP) { /* track event */ }
      pumpPulseEndMs = 0;
    }
    cumulativePumpMs += dt;
    if (!needsRefill && cumulativePumpMs >= 7000) needsRefill = true; // kept existing logic
  }

  // --- 1 Hz notify ---
  static unsigned long lastNotify = 0;
  if (bleClientConnected && pStateChar && now - lastNotify >= 1000) {
    lastNotify = now;

    long phaseMs = 0; unsigned long target = 0;
    switch (brewState) {
      case BREW_LOWERING: phaseMs = now - stateStartMs; target = LOWER_MS; break;
      case BREW_SOAKING:
        phaseMs = now - stateStartMs;
        target = (useFirstSoak? (unsigned long)first_min*60000UL :
                (pendingRefillBrew? soak_ms_postRefill :
                (unsigned long)first_min*60000UL)); break;
      case BREW_RAISING:  phaseMs = now - stateStartMs; target = RAISE_MS; break;
      default: break;
    }

    const char* bname = (brewState==BREW_IDLE)?"IDLE":
                        (brewState==BREW_LOWERING)?"LOWERING":
                        (brewState==BREW_SOAKING)?"SOAKING":
                        (brewState==BREW_RAISING)?"RAISING":"DONE";

    const char* sysname = systemOn? "ON" : "OFF";
    const char* dname = (dmode==DISP_TASTE)?"TASTE":(dmode==DISP_CUP)?"CUP":"NONE";
    const char* tname = (teaMode==TEA_GREEN) ? "GREEN" : "BLACK";
    const char* eventStr = "NONE";

    // NEW: compute water telemetry
    float water_ml = getWaterMl();
    float tank_pct = (tank_capacity_ml > 0.0f) ? (water_ml / tank_capacity_ml) : 0.0f;

    char json[420];
    snprintf(json, sizeof(json),
      "{\"sys\":\"%s\",\"tea\":\"%s\",\"T\":%.1f,\"heater\":%d,\"heating\":%d,"
      "\"brew\":\"%s\",\"brew_ms\":%ld,\"brew_total\":%lu,"
      "\"pump\":%d,\"dispense\":\"%s\",\"needs_refill\":%d,\"event\":\"%s\","
      "\"water_ml\":%.0f,\"tank_pct\":%.3f}",
      sysname, tname, T, heaterOn?1:0, heatingOn?1:0,
      bname, (long)phaseMs, target,
      pumpOn?1:0, dname, needsRefill?1:0, eventStr,
      water_ml, tank_pct);

    pStateChar->setValue((uint8_t*)json, strlen(json));
    pStateChar->notify();
  }
}
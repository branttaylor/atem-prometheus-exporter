const { Atem } = require("atem-connection");
const prom = require("prom-client");
const express = require("express");
require("dotenv").config();

const app = express();
const atem = new Atem();

const audioLevels = new prom.Gauge({
  name: "atem_audio_levels",
  help: "Audio levels per source in dB",
  labelNames: ["device_name", "source"]
});

const programInput = new prom.Gauge({
  name: "atem_program_input",
  help: "Currently active program input",
  labelNames: ["device_name"]
});

const previewInput = new prom.Gauge({
  name: "atem_preview_input",
  help: "Currently selected preview input",
  labelNames: ["device_name"]
});

const streamingStatus = new prom.Gauge({
  name: "atem_streaming_status",
  help: "Streaming status (1 = active, 0 = inactive)",
  labelNames: ["device_name"]
});

const recordingStatus = new prom.Gauge({
  name: "atem_recording_status",
  help: "Recording status (1 = active, 0 = inactive)",
  labelNames: ["device_name"]
});

const fps = new prom.Gauge({
  name: "atem_fps",
  help: "Frames per second",
  labelNames: ["device_name"]
});

const videoMode = new prom.Gauge({
  name: "atem_video_mode",
  help: "Current video mode (resolution and framerate)",
  labelNames: ["device_name"]
});

const ATEM_IP = process.env.ATEM_IP || "192.168.1.100";
const PORT = process.env.PORT || 8000;

async function updateMetrics() {
  prom.register.resetMetrics();
  const deviceName = atem.state?.info?.model || "Unknown ATEM";

  if (atem.state?.audio?.channels) {
    Object.keys(atem.state.audio.channels).forEach((source) => {
      const level = atem.state.audio.channels[source].gain;
      audioLevels.set({ device_name: deviceName, source }, level);
    });
  }

  if (atem.state?.video) {
    programInput.set({ device_name: deviceName }, atem.state.video.program[1]);
    previewInput.set({ device_name: deviceName }, atem.state.video.preview[1]);
  }

  if (atem.state?.streaming) {
    streamingStatus.set({ device_name: deviceName }, atem.state.streaming.active ? 1 : 0);
  }

  if (atem.state?.recording) {
    recordingStatus.set({ device_name: deviceName }, atem.state.recording.active ? 1 : 0);
  }

  if (atem.state?.settings) {
    fps.set({ device_name: deviceName }, atem.state.settings.frameRate || 0);
    videoMode.set({ device_name: deviceName }, atem.state.settings.videoMode || "Unknown");
  }
}

atem.on("connected", () => {
  console.log(`Connected to ATEM at ${ATEM_IP}`);
  setInterval(updateMetrics, 5000); // Update metrics every 5 seconds
});

atem.on("disconnected", () => {
  console.log("Disconnected from ATEM.");
});

atem.on("error", (err) => {
  console.error("ATEM Error:", err);
});

atem.connect(ATEM_IP);

// Prometheus endpoint
app.get("/metrics", async (req, res) => {
  try {
    await updateMetrics();
    res.set("Content-Type", prom.register.contentType);
    res.end(await prom.register.metrics());
  } catch (error) {
    res.status(500).send("Error collecting metrics");
  }
});

// Health check endpoint
app.get("/healthz", (req, res) => res.json({ status: "up" }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

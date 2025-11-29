// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CWA API 設定 =====
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // 必須從 .env 取得

// ===== CORS（必要！支援 GitHub Pages） =====
app.use(cors({
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "https://iming1130.github.io",
  ],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== API：宜蘭縣七日預報 F-D0047-003 =====
const getYilanWeekly = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "缺少 CWA_API_KEY",
        message: "請在 Zeabur 或 .env 中設定 CWA_API_KEY"
      });
    }

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-003`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: "宜蘭縣"
        },
        timeout: 10000,
      }
    );

    const records = response.data.records;
    if (!records || !records.locations || records.locations.length === 0) {
      return res.status(404).json({
        error: "查無資料",
        raw: response.data
      });
    }

    // F-D0047-003 結構不同：locations → location (0) → weatherElement[]
    const locationData = records.locations[0].location[0];
    const elements = {};
    locationData.weatherElement.forEach(el => {
      elements[el.elementName] = el.time;
    });

    const forecasts = [];

    // 找出最大 time 陣列長度
    const timeLen = Math.max(
      ...Object.values(elements).map(v => v.length)
    );

    for (let i = 0; i < timeLen; i++) {
      const get = (el) =>
        elements[el] && elements[el][i]
          ? elements[el][i].elementValue[0].value
          : null;

      const time = elements["Wx"] ? elements["Wx"][i] : null;

      forecasts.push({
        startTime: time?.startTime ?? null,
        endTime: time?.endTime ?? null,
        wx: get("Wx"),
        pop: get("PoP12h"),    // F-D0047 用 PoP12h
        minT: get("TMin"),
        maxT: get("TMax"),
        ci: get("WeatherDescription"),
        ws: get("WS"),         // 若沒有風速資料則顯示 null
      });
    }

    res.json({
      success: true,
      city: locationData.locationName,
      forecasts,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "CWA API 錯誤",
      detail: err.response?.data || err.message,
    });
  }
};

app.get("/api/weather/yilan", getYilanWeekly);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚴 單車追風天氣後端啟動在 port ${PORT}`);
});

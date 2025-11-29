// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CWA API 設定 =====
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // 只讀環境變數

// CORS 設定：明確允許 GitHub Pages 網域，增強安全性與穩定性
app.use(
  cors({
    origin: [
      "http://localhost:5500", // 本地開發用
      "http://127.0.0.1:5500", // 本地開發用
      "http://localhost:3000", // 本地開發用
      "https://iming1130.github.io", // 您的 GitHub Pages 前端網域
      "https://iming1130.github.io/CwaWeather-frontend", // 您的專案路徑
      "*", // 寬鬆模式，如果 Zeabur 代理有問題時使用
    ],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== API：宜蘭縣七日預報 F-D0047-003 =====
// 函式修改：接收 req 和 res 物件
const getYilanWeekly = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "缺少 CWA_API_KEY",
        message:
          "請在 .env 或 Zeabur 的 Environment Variables 中設定 CWA_API_KEY",
      });
    }

    // *** 核心修改：從 URL 參數取得鄉鎮名稱 ***
    // /api/weather/yilan/:town，若沒有參數則預設為 '宜蘭市'
    const locationName = req.params.town || "宜蘭市"; 
    
    // --- 請求七天鄉鎮市區預報 F-D0047-003 ---
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-003`,
      {
        params: {
          Authorization: CWA_API_KEY,
          // 使用 URL 傳入的鄉鎮名稱
          locationName: locationName, 
        },
        timeout: 8000,
      }
    );

    const records = response.data.records;

    // *** 核心修改：修正資料結構判斷與回傳錯誤格式 ***
    if (!records || !records.location || records.location.length === 0) {
      // 如果 CWA API 回傳的資料是空的或找不到地點，回傳 404
      return res.status(404).json({
        success: false, // 讓前端能正確判斷失敗
        error: "查無資料",
        message: `無法取得 ${locationName} 七天天氣預報。請確認該地點名稱是否正確或 CWA API 資料暫時未更新。`,
        raw: response.data,
      });
    }

    const locationData = records.location[0];
    const forecasts = [];
    const elements = {};

    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    const timeLen = Math.max(
      ...(Object.values(elements).map((t) => (t ? t.length : 0)))
    );

    for (let i = 0; i < timeLen; i++) {
      const getParam = (elName) => {
        const arr = elements[elName] || [];
        if (!arr[i]) return null;
        
        // F-D0047-003 的參數結構
        return arr[i].parameter || null; 
      };

      const wx = getParam("Wx");
      const pop = getParam("PoP");
      const minT = getParam("MinT");
      const maxT = getParam("MaxT");
      const ci = getParam("CI");
      const ws = getParam("WS");

      const timeMeta =
        (elements["Wx"] && elements["Wx"][i]) || {
          startTime: null,
          endTime: null,
        };

      forecasts.push({
        startTime: timeMeta.startTime,
        endTime: timeMeta.endTime,
        wx: wx ? wx.parameterName || wx.parameterValue : "",
        pop: pop ? pop.parameterName || pop.parameterValue : "",
        minT: minT ? minT.parameterName || minT.parameterValue : "",
        maxT: maxT ? maxT.parameterName || maxT.parameterValue : "",
        ci: ci ? ci.parameterName || ci.parameterValue : "",
        ws: ws ? ws.parameterName || ws.parameterValue : "",
      });
    }

    // 成功回傳
    res.json({
      success: true,
      dataset: "F-D0047-003", 
      city: locationData.locationName,
      updateTime: records.datasetDescription || records.datasetInfo || "",
      forecasts,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);
    let message = error.message;
    let status = 500;
    
    if (error.response) {
      // 處理 axios 收到 CWA 的錯誤回應
      message = error.response.data || error.response.statusText;
      status = error.response.status;
    }
    
    res.status(status).json({
      success: false,
      error: "伺服器錯誤",
      message: message,
    });
  }
};

// Routing
// 健康檢查路徑
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 1. 支援帶有鄉鎮參數的 API 路由 (ex: /api/weather/yilan/宜蘭市)
app.get("/api/weather/yilan/:town", getYilanWeekly);

// 2. 舊路由 /api/weather/yilan (使用預設的「宜蘭市」)
app.get("/api/weather/yilan", getYilanWeekly);

// 根路徑處理 (解決 Cannot GET / 的問題)
app.get("/", (req, res) => {
  res.json({
    service: "單車追風天氣 API",
    endpoints: {
      weekly: "/api/weather/yilan/:town",
      health: "/api/health",
    },
    default: "請訪問 /api/weather/yilan/宜蘭市 或使用 :town 參數查詢特定鄉鎮",
  });
});

// 404 錯誤處理
app.use((req, res) => {
  res.status(404).json({ success: false, error: "找不到此路徑" });
});

// ===== 啟動伺服器 =====
app.listen(PORT, () => {
  console.log(`🚴 單車追風天氣 API server running at port ${PORT}`);
});

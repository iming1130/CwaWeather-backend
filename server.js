// server.js 縣市級穩定版 (請部署此版本)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; 

// CORS 設定
app.use(cors({
    origin: ["http://localhost:3000", "https://iming1130.github.io"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== API：宜蘭縣三日預報 F-C0032-003 (最穩定) =====
const getYilanWeekly = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "缺少 CWA_API_KEY",
        message: "請在 Zeabur 或 .env 中設定 CWA_API_KEY",
      });
    }

    // F-C0032-003 資料集只接受縣市名稱
    const countyName = "宜蘭縣"; 
    
    // --- 請求三天縣市預報 F-C0032-003 ---
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-003`, // <-- 切換資料集 ID
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: countyName, 
        },
        timeout: 8000,
      }
    );

    const records = response.data.records;

    // F-C0032-003 結構：records.location[]
    const locationData = records?.location?.[0]; 

    if (!locationData) {
      return res.status(404).json({
        success: false,
        error: "資料集錯誤",
        message: "無法從 CWA 取得 F-C0032-003 資料集，請檢查 Key 或資料集是否有效。",
        raw: response.data,
      });
    }

    const forecasts = [];
    const elements = {};
    
    // 將所有天氣元素的時間陣列儲存在 elements 中
    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    // 取得時間長度 (F-C0032-003 固定是 7 個時段)
    const timeLen = elements['Wx'] ? elements['Wx'].length : 0;

    for (let i = 0; i < timeLen; i++) {
      
      const getValue = (elName, idx = 0) => {
        const timeArray = elements[elName];
        if (!timeArray || !timeArray[i]) return null;
        
        // F-C0032-003 的參數值在 parameter.parameterName
        return timeArray[i].parameter[idx]?.parameterName || null;
      };
      
      const timeMeta = elements["Wx"] ? elements["Wx"][i] : null;

      const wx = getValue("Wx", 0); // 天氣現象
      const pop = getValue("PoP", 0); // 降雨機率
      const minT = getValue("MinT", 0); // 最低溫
      const maxT = getValue("MaxT", 0); // 最高溫
      const ci = getValue("CI", 0); // 舒適度
      const ws = getValue("WS", 0); // 風速

      forecasts.push({
        startTime: timeMeta?.startTime ?? null,
        endTime: timeMeta?.endTime ?? null,
        wx: wx,
        pop: pop,
        minT: minT,
        maxT: maxT,
        ci: ci,
        ws: ws,
      });
    }

    // 成功回傳
    res.json({
      success: true,
      dataset: "F-C0032-003", 
      city: countyName, // 回傳宜蘭縣
      updateTime: records.datasetDescription || records.datasetInfo || "",
      forecasts,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);
    let message = error.message;
    let status = 500;
    
    if (error.response) {
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

// Routing 保持不變
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 所有對鄉鎮的請求現在都會回傳宜蘭縣的數據
app.get("/api/weather/yilan/:town", getYilanWeekly); 
app.get("/api/weather/yilan", getYilanWeekly);

app.get("/", (req, res) => {
  res.json({
    service: "單車追風天氣 API",
    endpoints: {
      weekly: "/api/weather/yilan/:town (現已切換至縣市級預報 F-C0032-003)",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "找不到此路徑" });
});

// ===== 啟動伺服器 =====
app.listen(PORT, () => {
  console.log(`🚴 API server running at port ${PORT}`);
});
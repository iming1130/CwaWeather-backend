// server.js 最終優化版 (請部署此版本)
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

// ===== API：宜蘭縣七日預報 F-D0047-003 =====
const getYilanWeekly = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "缺少 CWA_API_KEY",
        message: "請在 Zeabur 或 .env 中設定 CWA_API_KEY",
      });
    }

    const locationName = req.params.town || "宜蘭市"; 
    
    // --- 請求七天鄉鎮市區預報 F-D0047-003 ---
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-003`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName, 
        },
        timeout: 8000,
      }
    );

    const records = response.data.records;

    // *** 關鍵修正：正確存取地點陣列 (records.locations[0].location) ***
    const locationsArray = records?.locations?.[0]?.location; 

    if (!locationsArray || locationsArray.length === 0) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: `無法取得 ${locationName} 七天天氣預報。請確認地點名稱是否正確或 CWA API 資料暫時未更新。`,
        raw: response.data,
      });
    }

    const locationData = locationsArray[0]; 
    const forecasts = [];
    const elements = {};

    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    const timeLen = Math.max(
      ...(Object.values(elements).map((t) => (t ? t.length : 0)))
    );

    // 遍歷時間軸並建立預報項目
    for (let i = 0; i < timeLen; i++) {
      
      // *** 修正：精確存取 elementValue 的值，並處理缺失的欄位 ***
      const getValue = (elName, paramIndex = 0) => {
        const timeArray = elements[elName];
        if (!timeArray || !timeArray[i] || !timeArray[i].elementValue) return null;
        
        // 嘗試從 elementValue 陣列中取出值
        const elementValue = timeArray[i].elementValue[paramIndex];
        return elementValue?.value || elementValue?.measures || elementValue?.WeatherDescription || null;
      };

      const timeMeta = elements["Wx"] ? elements["Wx"][i] : null;

      // 由於 F-D0047-003 的欄位有時會被包裝在 WeatherDescription 中
      // 這裡直接讀取原始欄位，如果沒有，前端的 render 函式會處理
      const wx = getValue("Wx", 0);
      const pop = getValue("PoP12h", 0); 
      const minT = getValue("MinT", 0); 
      const maxT = getValue("MaxT", 0); 
      const ci = getValue("CI", 0);
      const ws = getValue("WS", 0);
      const weatherDesc = getValue("WeatherDescription", 0); // 獲取描述文字，用於 MinT/MaxT 不存在時的備援

      forecasts.push({
        startTime: timeMeta?.startTime ?? null,
        endTime: timeMeta?.endTime ?? null,
        wx: wx,
        pop: pop,
        minT: minT,
        maxT: maxT,
        ci: ci,
        ws: ws,
        weatherDesc: weatherDesc // 傳遞描述文字，以便前端處理
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
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/weather/yilan/:town", getYilanWeekly);
app.get("/api/weather/yilan", getYilanWeekly);

app.get("/", (req, res) => {
  res.json({
    service: "單車追風天氣 API",
    endpoints: {
      weekly: "/api/weather/yilan/:town",
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
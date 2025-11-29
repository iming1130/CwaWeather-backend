// server.js 最終修正版（專為 F-D0047-003 資料集優化）
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || process.env.ZEABUR_PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
// 從環境變數讀取金鑰，如 .env 或 Zeabur 設定
const CWA_API_KEY = process.env.CWA_API_KEY; 

// CORS 設定：允許您的前端網域
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

    // 取得鄉鎮名稱
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

    // *** 關鍵修正 1：正確存取地點陣列 (records.locations[0].location) ***
    const locationsArray = records?.locations?.[0]?.location; 

    if (!locationsArray || locationsArray.length === 0) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: `無法取得 ${locationName} 七天天氣預報。請確認該地點名稱是否正確或 CWA API 資料暫時未更新。`,
        raw: response.data,
      });
    }

    // 因為查詢時已指定 locationName，所以 locationsArray 只會包含一組地點資料
    const locationData = locationsArray[0]; 
    const forecasts = [];
    const elements = {};

    // 將所有天氣元素的時間陣列儲存在 elements 中
    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    // 找出最長的時間軸長度
    const timeLen = Math.max(
      ...(Object.values(elements).map((t) => (t ? t.length : 0)))
    );

    // 遍歷時間軸並建立預報項目
    for (let i = 0; i < timeLen; i++) {
      
      // *** 關鍵修正 2：氣象參數存取邏輯 (F-D0047-003 的特殊結構) ***
      const getParamValue = (elName, paramIndex = 0) => {
        const timeArray = elements[elName];
        if (!timeArray || !timeArray[i] || !timeArray[i].elementValue) return null;
        
        const elementValue = timeArray[i].elementValue[paramIndex];
        return elementValue?.value || elementValue?.measures || null;
      };

      const timeMeta = elements["Wx"] ? elements["Wx"][i] : null;
      const wx = getParamValue("Wx", 0); // 天氣現象
      const pop = getParamValue("PoP12h", 0); // 12小時降雨機率
      const minT = getParamValue("MinT", 0); // 最低溫
      const maxT = getParamValue("MaxT", 0); // 最高溫
      const ci = getParamValue("CI", 0); // 舒適度指數
      const ws = getParamValue("WS", 0); // 風速

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

// 1. 支援帶有鄉鎮參數的 API 路由 (ex: /api/weather/yilan/宜蘭市)
app.get("/api/weather/yilan/:town", getYilanWeekly);

// 2. 舊路由 /api/weather/yilan (使用預設的「宜蘭市」)
app.get("/api/weather/yilan", getYilanWeekly);

// 根路徑處理
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
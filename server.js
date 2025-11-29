// server.js 最終穩定版（請部署此版本）
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
    // 注意：這裡不傳 locationName 參數，而是撈取所有宜蘭縣鄉鎮的資料，然後在後端篩選
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-D0047-003`,
      {
        params: {
          Authorization: CWA_API_KEY,
          // 移除 locationName 參數，讓 CWA 回傳該資料集支援的所有宜蘭縣鄉鎮資料
          // 讓後端程式碼自己篩選，更穩定
        },
        timeout: 8000,
      }
    );

    const records = response.data.records;

    // *** 關鍵修正：確保 records 存在，並取得 locations 陣列 ***
    const allLocations = records?.locations?.[0]?.location; 

    if (!allLocations || allLocations.length === 0) {
      // 如果連整個資料集都撈不到，表示 CWA API 或 Key 有問題
      return res.status(404).json({
        success: false,
        error: "資料集錯誤",
        message: "無法從 CWA 取得 F-D0047-003 資料集，請檢查 Key 或資料集是否有效。",
        raw: response.data,
      });
    }

    // *** 關鍵修正：在後端篩選出使用者選擇的鄉鎮 ***
    const locationData = allLocations.find(loc => loc.locationName === locationName);
    
    if (!locationData) {
        return res.status(404).json({
            success: false,
            error: "查無資料",
            message: `F-D0047-003 資料集不包含 ${locationName} 的預報。`,
            raw: records.locations[0].location.map(l => l.locationName),
        });
    }


    const forecasts = [];
    const elements = {};

    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    const timeLen = Math.max(
      ...(Object.values(elements).map((t) => (t ? t.length : 0)))
    );

    for (let i = 0; i < timeLen; i++) {
      
      const getValue = (elName, paramIndex = 0) => {
        const timeArray = elements[elName];
        if (!timeArray || !timeArray[i] || !timeArray[i].elementValue) return null;
        
        const elementValue = timeArray[i].elementValue[paramIndex];
        return elementValue?.value || elementValue?.measures || null;
      };
      
      // 確保獲取描述文字，以便前端處理
      const getDescription = (elName, paramIndex = 0) => {
        const timeArray = elements[elName];
        if (!timeArray || !timeArray[i] || !timeArray[i].elementValue) return null;
        const elementValue = timeArray[i].elementValue[paramIndex];
        return elementValue?.description || null;
      };

      const timeMeta = elements["Wx"] ? elements["Wx"][i] : null;

      // 數據欄位修正：T為氣溫，MinT/MaxT是最低/最高溫
      const wx = getDescription("Wx", 0); // 天氣現象文字
      const pop = getValue("PoP12h", 0); // 12小時降雨機率
      const minT = getValue("MinT", 0); // 最低溫
      const maxT = getValue("MaxT", 0); // 最高溫
      const ci = getDescription("CI", 0); // 舒適度文字
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

// Routing 保持不變
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
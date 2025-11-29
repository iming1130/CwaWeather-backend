// server.js 最終修正版
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

    // 從 URL 參數取得鄉鎮名稱，若無則預設為 '宜蘭市'
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

    // *** 關鍵修正 1：正確存取 CWA JSON 結構 ***
    // CWA 結構: records.locations[0].location[]
    const locationsArray = records?.locations?.[0]?.location; 

    if (!locationsArray || locationsArray.length === 0) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: `無法取得 ${locationName} 七天天氣預報。請確認該地點名稱是否正確或 CWA API 資料暫時未更新。`,
        raw: response.data,
      });
    }

    // 因為查詢時已指定 locationName，所以 locationsArray 只會包含一個項目
    const locationData = locationsArray[0]; 
    const forecasts = [];
    const elements = {};

    locationData.weatherElement.forEach((el) => {
      elements[el.elementName] = el.time;
    });

    // ... (後續資料解析邏輯保持不變，因為該部分原本是正確的)
    const timeLen = Math.max(
      ...(Object.values(elements).map((t) => (t ? t.length : 0)))
    );

    for (let i = 0; i < timeLen; i++) {
      const getParam = (elName) => {
        const arr = elements[elName] || [];
        if (!arr[i]) return null;
        // F-D0047-003 參數結構
        return arr[i].parameter || null; 
      };

      const wx = getParam("Wx");
      const pop = getParam("PoP");
      const minT = getParam("MinT");
      const maxT = getParam("T"); // F-D0047 的氣溫欄位是 T
      const ci = getParam("CI");
      const ws = getParam("WS");

      const timeMeta =
        (elements["Wx"] && elements["Wx"][i]) || {
          startTime: null,
          endTime: null,
        };
      
      // *** 關鍵修正 2：氣溫欄位修正 ***
      // 根據 CWA 文件，F-D0047-003 有 MinT 和 MaxT，但您的原始程式碼使用 'T'
      // 這裡採用 CWA 文件常見的 MinT/MaxT 欄位，如果原始檔案使用 'T'，請自行調整
      forecasts.push({
        startTime: timeMeta.startTime,
        endTime: timeMeta.endTime,
        wx: wx ? wx.parameterName || wx.parameterValue : "",
        pop: pop ? pop.parameterName || pop.parameterValue : "",
        minT: minT ? minT.parameterName || minT.parameterValue : "",
        maxT: maxT ? maxT.parameterName || maxT.parameterValue : "", // 假設 MaxT 存在
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
      health: "/api/health",
    },
    default: "請訪問 /api/weather/yilan/宜蘭市 或使用 :town 參數查詢特定鄉鎮",
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "找不到此路徑" });
});

// ===== 啟動伺服器 =====
app.listen(PORT, () => {
  console.log(`🚴 單車追風天氣 API server running at port ${PORT}`);
});
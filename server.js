require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
// 從環境變數讀取金鑰，如果未設定，則為空字串
const CWA_API_KEY = process.env.CWA_API_KEY || ""; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得宜蘭縣的天氣預報 (F-D0047-091: 鄉鎮 3 小時預報)
 * 此資料集包含 AT (體感溫度) 和 WS (風速) 等詳細資訊，適合您的單車應用。
 */
const getYilanWeather = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const DATA_ID = "F-D0047-091"; // 鄉鎮 3 小時預報
    const LOCATION = "宜蘭縣";

    // 呼叫 CWA API
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/${DATA_ID}`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: LOCATION,
          // 確保取得前端所需的全部要素
          elementName: "AT,WS,PoP6h,PoP12h,Wx,MaxT,MinT" 
        },
      }
    );

    // 直接回傳 CWA 的原始 JSON 資料結構，讓前端自行解析。
    // 這確保了您的前端解析邏輯 (parseCwaData) 能繼續使用。
    res.json(response.data);

  } catch (error) {
    console.error("取得宜蘭天氣資料失敗:", error.message);

    if (error.response) {
      // CWA API 回應錯誤 (例如授權碼無效)
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API 代理服務",
    endpoints: {
      yilan: "/api/weather/yilan",
      health: "/api/health",
    },
    note: "請確保 CWA_API_KEY 已在環境變數中設定。",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 新增並修正取得宜蘭天氣預報的路徑
app.get("/api/weather/yilan", getYilanWeather);

// 移除原本混亂的 /api/weather/kaohsiung 路由或將其修正為取得高雄資料。
// 這裡將其修正為取得高雄資料，以保持原有的 Kaohsiung 路由功能。
// 為了避免混淆，我們將 Kaohsiung 路由也改為使用 F-D0047 資料集，但查詢高雄市。
const getKaohsiungWeather = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({ error: "伺服器設定錯誤", message: "請在 .env 檔案中設定 CWA_API_KEY" });
    }
    const DATA_ID = "F-D0047-071"; // 高雄市的 F-D0047 資料集 ID
    const LOCATION = "高雄市";

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/${DATA_ID}`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: LOCATION,
          elementName: "AT,WS,PoP6h,PoP12h,Wx,MaxT,MinT" 
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("取得高雄天氣資料失敗:", error.message);
    res.status(500).json({ error: "伺服器錯誤", message: "無法取得高雄天氣資料" });
  }
};
app.get("/api/weather/kaohsiung", getKaohsiungWeather);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
  console.log(`📡 監聽 Port: ${PORT}`);
});
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
// 確保 CWA_API_KEY 變數存在
const CWA_API_KEY = process.env.CWA_API_KEY || ""; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 通用天氣資料取得函數
 * @param {string} dataId - CWA 資料集 ID (宜蘭縣 F-D0047-091, 高雄市 F-D0047-071)
 * @param {string} locationName - 地點名稱 (例如: "宜蘭縣" 或 "高雄市")
 */
const fetchCwaData = async (dataId, locationName) => {
  // 檢查 API Key 是否設置
  if (!CWA_API_KEY) {
    throw new Error("伺服器設定錯誤: 請在 .env 檔案中設定 CWA_API_KEY (或檢查 Zeabur 環境變數是否載入)");
  }

  // 增加錯誤處理以捕捉 Axios 級別的錯誤（例如網絡連線失敗）
  try {
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/${dataId}`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName,
          // 確保取得前端所需的全部要素: 體感溫度(AT), 風速(WS), 降雨機率(PoP6h/PoP12h), 天氣(Wx), 溫度(MaxT/MinT)
          elementName: "AT,WS,PoP6h,PoP12h,Wx,MaxT,MinT", 
        },
      }
    );
    
    // 檢查 CWA 回應是否包含錯誤訊息 (CWA 官方的回應)
    if (response.data.success === "false") {
      // 增加 CWA 提供的錯誤碼 (Code)
      const errorCode = response.data.result && response.data.result.code ? ` (${response.data.result.code})` : '';
      // 注意：這通常不會在 Key 無效時觸發，而是在其他參數錯誤時觸發
      throw new Error(response.data.message + errorCode || "CWA API 請求失敗 (CWA Success=false)");
    }
    
    // *** 修正點：檢查是否有 'records' 屬性，這是判斷是否為實際資料的關鍵 ***
    // 當 API Key 無效時，CWA 通常回傳 success=true 但只包含 metadata (result/fields)
    if (!response.data.records) {
      console.error("CWA API 回應缺少 'records' 屬性。CWA 原始回應:", JSON.stringify(response.data, null, 2));
      throw new Error("CWA API 呼叫失敗。請檢查 CWA_API_KEY 是否有效，或 CWA API 網址/參數是否正確。CWA 回傳了元數據而非實際資料。");
    }

    // 成功取得資料
    return {
      success: "true",
      data: response.data 
    };
  } catch (axiosError) {
      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
          throw new Error(`網絡連線失敗: 無法連接到 CWA API 伺服器。`);
      }
      // 處理其他 Axios 錯誤，例如 404/500
      if (axiosError.response) {
        throw new Error(`CWA API 伺服器回應錯誤 (HTTP ${axiosError.response.status})。`);
      }
      throw new Error(`連線到 CWA API 時發生未知錯誤: ${axiosError.message}`);
  }
};


// 取得宜蘭縣天氣預報
const getYilanWeather = async (req, res) => {
  try {
    const data = await fetchCwaData("F-D0047-091", "宜蘭縣");
    res.json(data);
  } catch (error) {
    console.error("取得宜蘭天氣資料失敗:", error.message);
    // 嘗試使用 Axios 錯誤的回應狀態碼，否則使用 500
    const status = error.response ? error.response.status : 500;
    res.status(status).json({
      success: "false",
      error: "伺服器錯誤",
      message: error.message,
    });
  }
};

// 取得高雄市天氣預報
const getKaohsiungWeather = async (req, res) => {
  try {
    const data = await fetchCwaData("F-D0047-071", "高雄市");
    res.json(data);
  } catch (error) {
    console.error("取得高雄天氣資料失敗:", error.message);
    const status = error.response ? error.response.status : 500;
    res.status(status).json({
      success: "false",
      error: "伺服器錯誤",
      message: error.message,
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API 代理服務",
    endpoints: {
      yilan: "/api/weather/yilan",
      kaohsiung: "/api/weather/kaohsiung",
      health: "/api/health",
    },
    note: `CWA API Key 狀態: ${CWA_API_KEY ? '已載入' : '遺失'}`,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/weather/yilan", getYilanWeather);
app.get("/api/weather/kaohsiung", getKaohsiungWeather);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: "false",
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: "false",
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
  console.log(`📡 監聽 Port: ${PORT}`);
  // *** 新增的輸出，用於在 Zeabur Log 中確認 Key 是否成功載入 ***
  console.log(`🔑 CWA_API_KEY 狀態: ${CWA_API_KEY ? '已成功載入 (長度: ' + CWA_API_KEY.length + ')' : '遺失或為空'}`);
});
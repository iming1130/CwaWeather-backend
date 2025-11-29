require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY || ""; 

// 縣市代碼與 CWA 資料集 ID 的對應表
// 注意：F-D0047 資料集 ID 是依縣市分開的
const CWA_DATA_IDS = {
    "Taipei": "F-D0047-063",        // 臺北市
    "NewTaipei": "F-D0047-071",     // 新北市
    "Taoyuan": "F-D0047-007",       // 桃園市
    "Taichung": "F-D0047-075",      // 臺中市
    "Tainan": "F-D0047-079",        // 臺南市
    "Kaohsiung": "F-D0047-067",     // 高雄市
    "Keelung": "F-D0047-051",       // 基隆市
    "Hsinchu": "F-D0047-055",       // 新竹市
    "HsinchuCounty": "F-D0047-011", // 新竹縣
    "MiaoliCounty": "F-D0047-015",  // 苗栗縣
    "ChanghuaCounty": "F-D0047-019",// 彰化縣
    "NantouCounty": "F-D0047-023",  // 南投縣
    "YunlinCounty": "F-D0047-027",  // 雲林縣
    "Chiayi": "F-D0047-083",        // 嘉義市
    "ChiayiCounty": "F-D0047-031",  // 嘉義縣
    "PingtungCounty": "F-D0047-035",// 屏東縣
    "YilanCounty": "F-D0047-091",   // 宜蘭縣
    "HualienCounty": "F-D0047-047", // 花蓮縣
    "TaitungCounty": "F-D0047-043", // 臺東縣
    "PenghuCounty": "F-D0047-039",  // 澎湖縣
    "KinmenCounty": "F-D0047-095",  // 金門縣
    "LienchiangCounty": "F-D0047-099" // 連江縣
};

// 縣市名稱與英文代碼的對應表 (用於 API 查詢 locationName)
const LOCATION_NAMES = {
    "Taipei": "臺北市", "NewTaipei": "新北市", "Taoyuan": "桃園市", "Taichung": "臺中市",
    "Tainan": "臺南市", "Kaohsiung": "高雄市", "Keelung": "基隆市", "Hsinchu": "新竹市",
    "HsinchuCounty": "新竹縣", "MiaoliCounty": "苗栗縣", "ChanghuaCounty": "彰化縣",
    "NantouCounty": "南投縣", "YunlinCounty": "雲林縣", "Chiayi": "嘉義市", "ChiayiCounty": "嘉義縣",
    "PingtungCounty": "屏東縣", "YilanCounty": "宜蘭縣", "HualienCounty": "花蓮縣",
    "TaitungCounty": "臺東縣", "PenghuCounty": "澎湖縣", "KinmenCounty": "金門縣", "LienchiangCounty": "連江縣"
};


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定縣市的天氣預報 (F-D0047-XXX: 鄉鎮 3 小時預報)
 * @param {string} cityCode - 縣市的英文代碼 (e.g., 'YilanCounty')
 */
const getCityWeather = async (req, res) => {
    const { cityCode } = req.params;

    try {
        if (!CWA_API_KEY) {
            return res.status(500).json({
                error: "伺服器設定錯誤",
                message: "請在 .env 檔案中設定 CWA_API_KEY",
            });
        }

        const DATA_ID = CWA_DATA_IDS[cityCode];
        const LOCATION = LOCATION_NAMES[cityCode];

        if (!DATA_ID || !LOCATION) {
             return res.status(400).json({
                error: "無效的縣市代碼",
                message: `找不到縣市代碼: ${cityCode} 對應的 CWA 資料集 ID`,
            });
        }
        
        // 呼叫 CWA API
        const response = await axios.get(
            `${CWA_API_BASE_URL}/v1/rest/datastore/${DATA_ID}`,
            {
                params: {
                    Authorization: CWA_API_KEY,
                    // 這裡的 locationName 必須是該縣市的名稱，但 F-D0047-XXX 的資料集已經是單一縣市，
                    // 所以 locationName 其實可以省略或填寫縣市名。這裡填寫縣市名更保險。
                    locationName: LOCATION, 
                    // 確保取得前端所需的全部要素
                    elementName: "AT,WS,PoP6h,PoP12h,Wx,MaxT,MinT"
                },
            }
        );

        // 回傳 CWA 的原始 JSON 資料結構
        res.json(response.data);

    } catch (error) {
        console.error(`取得 ${cityCode} 天氣資料失敗:`, error.message);

        if (error.response) {
            // CWA API 回應錯誤
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

// --- Routes ---
app.get("/", (req, res) => {
    res.json({
        message: "歡迎使用 CWA 天氣預報 API 代理服務",
        endpoints: {
            city_weather: "/api/weather/:cityCode",
            example: "/api/weather/YilanCounty",
            health: "/api/health",
        },
        note: "請確保 CWA_API_KEY 已在環境變數中設定。",
    });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 通用縣市天氣路徑：使用 cityCode 參數，取代原有的單一縣市路徑
app.get("/api/weather/:cityCode", getCityWeather);

// 移除原有的 /api/weather/yilan 和 /api/weather/kaohsiung 路由以避免混亂

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
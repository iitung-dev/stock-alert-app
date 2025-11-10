import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// const { data } = axios.get("https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=TSLA&apikey=ZJ33VM40ULBSPUH4",)
//     .then((response) => console.log(response))
//     .catch((error) => console.log(error))

const BASE = "https://www.alphavantage.co/query"
const WATCHLIST = ["TSLA", "META", "AAPL", "NVDA", "VOO", "AMZN", "PLTR", "GOOG", "SHOP"]

// ============= Helper to fetch daily prices =====================
async function getDailyPrices(symbol) {
    try {
        const { data } = await axios.get(BASE, {
            params: {
                function: "TIME_SERIES_DAILY",
                symbol,
                apikey: process.env.ALPHA_KEY
            }
        })

        const series = data["Time Series (Daily)"];
        if (!series) {
            console.log(`⚠️ No data for ${symbol}`);
            return null;
        }

        const dates = Object.keys(series);
        const latest = parseFloat(series[dates[0]]["4. close"])         //today
        const prevDayClose = parseFloat(series[dates[1]]["4. close"])   //yesterday
        const weekAgoClose = parseFloat(series[dates[5]]["4. close"])   //1week ago
        const monthAgoClose = parseFloat(series[dates[20]]["4. close"]) //1month ago

        return { latest, prevDayClose, weekAgoClose, monthAgoClose }

    } catch (err) {
        console.error(`❌ Error fetching ${symbol}:`, err.message);
        return null;
    }

}

// ============== Send alert to Discord ============
async function sendDiscordAlert(symbol, message) {
    const payload = {
        username: "📉 Stock Alert Bot",
        embeds: [
            {
                title: `${symbol} Alert`,
                description: message,
                color: 0xff0000,
                timestamp: new Date(),
            },
        ],
    };

    await axios.post(process.env.DISCORD_WEBHOOK, payload);
    console.log(`✅ Sent alert for ${symbol}: ${message}`);

}

async function checkStocks() {
    for (const symbol of WATCHLIST) {
        const prices = await getDailyPrices(symbol);
        if (!prices) continue;

        const { latest, prevDay, weekAgo, monthAgo } = prices;

        const dayChange = ((latest - prevDay) / prevDay) * 100
        const weekChange = ((latest - weekAgo) / weekAgo) * 100
        const monthChange = ((latest - monthAgo) / monthAgo) * 100

        if (dayChange <= -2)
            await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today`)
        if (weekChange <= -10)
            await sendDiscordAlert(symbol, `${symbol} dropped ${weekChange.toFixed(2)}% today`)
        if (monthChange <= -10)
            await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% today`)
    }
}

cron.schedule("0 8 * * 1-5", checkStocks);
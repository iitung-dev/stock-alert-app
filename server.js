import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

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
    try {
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
    } catch {
        console.error(`Error: ❌ Failed to send alert for ${symbol}:`, err.message)
    }
}

async function checkStocks() {
  console.log("🔍 Checking stocks at", new Date().toLocaleString());

  let allNoData = true;

  for (const symbol of WATCHLIST) {
    const prices = await getDailyPrices(symbol);
    if (!prices) continue;
    allNoData = false;

    const { latest, prevDayClose, weekAgoClose, monthAgoClose } = prices;

    const dayChange = ((latest - prevDayClose) / prevDayClose) * 100;
    const weekChange = ((latest - weekAgoClose) / weekAgoClose) * 100;
    const monthChange = ((latest - monthAgoClose) / monthAgoClose) * 100;

    if (dayChange <= -5)
      await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today`);
    if (weekChange <= -10)
      await sendDiscordAlert(symbol, `${symbol} dropped ${weekChange.toFixed(2)}% this week`);
    if (monthChange <= -10)
      await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% this month`);
  }

  if (allNoData) {
    console.log("⚠️ No data found for all symbols — exiting gracefully.");
    // only exit if not running as a cron service
    if (!process.env.RENDER) process.exit(0);
  } else {
    console.log("✅ Stock check completed.");
    process.exit(0)
  }
}


cron.schedule("0 8 * * 1-5", checkStocks);
await checkStocks();
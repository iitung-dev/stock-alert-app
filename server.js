import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const BASE = "https://www.alphavantage.co/query";
const WATCHLIST = ["TSLA", "META", "AAPL", "NVDA", "VOO", "AMZN", "PLTR", "GOOG", "SHOP"];

// Helper
async function getDailyPrices(symbol) {
    try {
        const { data } = await axios.get(BASE, {
            params: {
                function: "TIME_SERIES_DAILY",
                symbol,
                apikey: process.env.ALPHA_KEY,
            },
        });

        const series = data["Time Series (Daily)"];
        if (!series) {
            console.log(`⚠️ No data for ${symbol}`);
            return null;
        }

        const dates = Object.keys(series);
        const latest = parseFloat(series[dates[0]]["4. close"]);
        const prevDay = parseFloat(series[dates[1]]["4. close"]);
        const weekAgo = parseFloat(series[dates[5]]["4. close"]);
        const monthAgo = parseFloat(series[dates[20]]["4. close"]);

        return { latest, prevDay, weekAgo, monthAgo };
    } catch (err) {
        console.error(`❌ Error fetching ${symbol}:`, err.message);
        return null;
    }
}

// Discord alert
async function sendDiscordAlert(symbol, message, color = 0xffa500) {
    try {
        const payload = {
            username: "📉 Stock Alert Bot",
            embeds: [
                {
                    title: `${symbol} Alert`,
                    description: message,
                    color,
                    timestamp: new Date(),
                },
            ],
        };
        await axios.post(process.env.DISCORD_WEBHOOK, payload);
        console.log(`✅ Sent alert for ${symbol}: ${message}`);
    } catch (err) {
        console.error(`❌ Failed to send alert:`, err.message);
    }
}

// Daily
async function checkDaily() {
    console.log("📅 Running Daily Check:", new Date().toLocaleString());
    for (const symbol of WATCHLIST) {
        const p = await getDailyPrices(symbol);
        if (!p) continue;

        const dayChange = ((p.latest - p.prevDay) / p.prevDay) * 100;

        if (dayChange <= -10)
            await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today 🚨`, 0xff0000);
        else if (dayChange <= -5)
            await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today ⚠️`, 0xffa500);
    }
}

// Weekly Summary
async function checkWeekly() {
    console.log("📊 Running Weekly Summary:", new Date().toLocaleString());
    let summary = "📈 **Weekly Performance Summary**\n\n";
    for (const symbol of WATCHLIST) {
        const p = await getDailyPrices(symbol);
        if (!p) continue;

        const weekChange = ((p.latest - p.weekAgo) / p.weekAgo) * 100;
        summary += `**${symbol}**: ${weekChange.toFixed(2)}%\n`;
    }
    await sendDiscordAlert("Overall", summary, 0x3498db);
}

// Monthly
async function checkMonthly() {
    console.log("🗓️ Running Monthly Check:", new Date().toLocaleString());
    for (const symbol of WATCHLIST) {
        const p = await getDailyPrices(symbol);
        if (!p) continue;

        const monthChange = ((p.latest - p.monthAgo) / p.monthAgo) * 100;

        if (monthChange <= -15)
            await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% this month 🚨`, 0xff0000);
        else if (monthChange <= -10)
            await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% this month ⚠️`, 0xffa500);
    }
}

// Schedule
cron.schedule("0 21 * * 1-5", checkDaily); // After market close
cron.schedule("0 1 * * 0", checkWeekly); // Sunday
cron.schedule("0 8 1 * *", checkMonthly); // First day monthly

console.log("🚀 Stock Alert Cron Jobs Scheduled");

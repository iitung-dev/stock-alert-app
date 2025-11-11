import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const BASE = "https://www.alphavantage.co/query";
const WATCHLIST = ["TSLA", "META", "AAPL", "NVDA", "VOO", "AMZN", "PLTR", "GOOG", "SHOP"];

// Helper to fetch prices
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
        return {
            latest: parseFloat(series[dates[0]]["4. close"]),
            prevDay: parseFloat(series[dates[1]]["4. close"]),
            weekAgo: parseFloat(series[dates[5]]["4. close"]),
            monthAgo: parseFloat(series[dates[20]]["4. close"]),
        };
    } catch (err) {
        console.error(`❌ Error fetching ${symbol}:`, err.message);
        return null;
    }
}

// Send Discord alert
async function sendDiscordAlert(symbol, message, color = 0xffa500) {
    try {
        await axios.post(process.env.DISCORD_WEBHOOK, {
            username: "📉 Stock Alert Bot",
            embeds: [{ title: `${symbol} Alert`, description: message, color, timestamp: new Date() }],
        });
        console.log(`✅ Sent alert for ${symbol}: ${message}`);
    } catch (err) {
        console.error(`❌ Failed to send alert:`, err.message);
    }
}

// Daily check: alerts on >5% (warning) and >10% (alert) drops in a day
async function checkDaily() {
    console.log("📅 Running Daily Check:", new Date().toLocaleString());
    for (const symbol of WATCHLIST) {
        const prices = await getDailyPrices(symbol);
        if (!prices) continue;

        const dayChange = ((prices.latest - prices.prevDay) / prices.prevDay) * 100;

        if (dayChange <= -10) {
            await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today 🚨`, 0xff0000);
        } else if (dayChange <= -5) {
            await sendDiscordAlert(symbol, `${symbol} dropped ${dayChange.toFixed(2)}% today ⚠️`, 0xffa500);
        }
    }
}

// Weekly check: alert if dropped >10% in the week
async function checkWeekly() {
    console.log("📅 Running Weekly Check:", new Date().toLocaleString());
    for (const symbol of WATCHLIST) {
        const prices = await getDailyPrices(symbol);
        if (!prices) continue;

        const weekChange = ((prices.latest - prices.weekAgo) / prices.weekAgo) * 100;

        if (weekChange <= -10) {
            await sendDiscordAlert(symbol, `${symbol} dropped ${weekChange.toFixed(2)}% this week 🚨`, 0xff0000);
        }
    }
}

// Monthly check: warning at >10%, alert at >15% drop in the month
async function checkMonthly() {
    console.log("📅 Running Monthly Check:", new Date().toLocaleString());
    for (const symbol of WATCHLIST) {
        const prices = await getDailyPrices(symbol);
        if (!prices) continue;

        const monthChange = ((prices.latest - prices.monthAgo) / prices.monthAgo) * 100;

        if (monthChange <= -15) {
            await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% this month 🚨`, 0xff0000);
        } else if (monthChange <= -10) {
            await sendDiscordAlert(symbol, `${symbol} dropped ${monthChange.toFixed(2)}% this month ⚠️`, 0xffa500);
        }
    }
}

// Daily (US market close 4 PM ET = 21 UTC)
cron.schedule("0 21 * * 1-5", checkDaily, { timezone: "UTC" });

// Weekly (Sunday 9 AM MYT)
cron.schedule("0 9 * * 0", checkWeekly, { timezone: "Asia/Kuala_Lumpur" });

// Monthly (1st day 9 AM MYT)
cron.schedule("0 9 1 * *", checkMonthly, { timezone: "Asia/Kuala_Lumpur" });

app.get("/", (req, res) => res.send("🚀 Stock Alert Bot is running"));

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log("🚀 Stock Alert Cron Jobs Scheduled");
});

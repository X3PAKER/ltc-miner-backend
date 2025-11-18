const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bodyParser = require("body-parser");
const { v4: uuid } = require("uuid");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DB_PATH = "./db/data.json";
const MINING_RATE = 0.00003; // LTC per second
const STAKING_RATE = 0.10; // 10% per day

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// AUTH ==========================
app.post("/auth/login", (req, res) => {
  const { telegramId, name, username, ref } = req.body;

  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);

  if (!user) {
    user = {
      id: uuid(),
      telegramId,
      name,
      username,
      refBy: ref || null,
      balanceUSDT: 0,
      balanceLTC: 0,
      lastMine: Date.now(),
      staking: [],
      team: [],
      createdAt: Date.now(),
    };
    db.users.push(user);
    saveDB(db);
  }

  return res.json({ ok: true, user });
});

// PRICE ==========================
app.get("/price/ltc", async (req, res) => {
  try {
    const r = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd"
    );
    res.json({ ok: true, price: r.data.litecoin.usd });
  } catch (e) {
    res.json({ ok: false, error: "Price error" });
  }
});

// MINING ==========================
app.post("/miner/claim", (req, res) => {
  const { telegramId } = req.body;
  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);

  let now = Date.now();
  let seconds = (now - user.lastMine) / 1000;
  let earned = seconds * MINING_RATE;

  user.balanceLTC += earned;
  user.lastMine = now;
  saveDB(db);

  return res.json({ ok: true, earned, balanceLTC: user.balanceLTC });
});

// WALLET ==========================
app.get("/wallet/info", (req, res) => {
  const { telegramId } = req.query;
  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);
  return res.json({
    ok: true,
    balanceUSDT: user.balanceUSDT,
    balanceLTC: user.balanceLTC,
  });
});

// DEPOSIT (fake) ==================
app.post("/wallet/deposit", (req, res) => {
  const { telegramId, amount } = req.body;
  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);

  user.balanceUSDT += amount;

  // REF BONUS FOR F0
  if (user.refBy) {
    let f0 = db.users.find((u) => `REF${u.telegramId}` == user.refBy);
    if (f0) f0.balanceUSDT += amount * 0.1;
  }

  saveDB(db);
  return res.json({ ok: true, balanceUSDT: user.balanceUSDT });
});

// STAKING ==========================
app.post("/staking/add", (req, res) => {
  const { telegramId, amount } = req.body;
  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);

  if (user.balanceUSDT < amount)
    return res.json({ ok: false, error: "Not enough USDT" });

  user.balanceUSDT -= amount;
  user.staking.push({ amount, time: Date.now() });
  saveDB(db);
  return res.json({ ok: true });
});

app.get("/staking/info", (req, res) => {
  const { telegramId } = req.query;
  const db = loadDB();
  let user = db.users.find((u) => u.telegramId == telegramId);

  let profit = 0;
  user.staking.forEach((s) => {
    let days = (Date.now() - s.time) / 86400000;
    profit += s.amount * STAKING_RATE * days;
  });

  return res.json({ ok: true, profit });
});

app.listen(3001, () => console.log("🔥 Backend running on port 3001"));

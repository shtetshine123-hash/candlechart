const PLATFORMS = {
    "6LOTTERY": "https://6lotteryapi.com/api/webapi/",
    "777BIGWIN": "https://api.bigwinqaz.com/api/webapi/",
    "CKLOTTERY": "https://ckygjf6r.com/api/webapi/"
};
const MAX_CANDLES = 500;
const STORAGE_CANDLES = "trx_candle_pure_data";
const STORAGE_HISTORY = "trx_bet_history";
const MYANMAR_OFFSET = 6.5 * 60 * 60 * 1000;
let authToken = "";
let selectedPlatform = "777BIGWIN";
let candleData = [];
let canvas, ctx;
let chartWidth = 0, chartHeight = 0;
let scale = 1.0;
let offsetX = 40;
let dpr = 1;
let lastMouseX = 0;
let lastMouseY = 0;
let isDragging = false;
let lastDragX = 0;
let showCrosshair = true;
let hoveredIndex = -1;
let nextPeriodTimestamp = null;
let timerInterval = null;
let apiInterval = null;
let pendingBet = null;
let localBalance = 0;
let isVerticalView = true; 
let bettingLocked = false;
let currentSelectedType = 13;
let currentMultiplier = 0;
let betHistory = [];

function loadBetHistory() {
    const stored = localStorage.getItem(STORAGE_HISTORY);
    if (stored) {
        try { betHistory = JSON.parse(stored); } catch(e) { betHistory = []; }
    } else { betHistory = []; }
}
function saveBetHistory() {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(betHistory));
}
function addBetHistory(entry) {
    betHistory.unshift(entry);
    if (betHistory.length > 100) betHistory = betHistory.slice(0, 100);
    saveBetHistory();
    renderHistory();
}
function updateBetHistory(period, result, number, winAmount) {
    for (let h of betHistory) {
        if (h.period === period && h.status === 'pending') {
            h.result = result;
            h.number = number;
            h.winAmount = winAmount;
            h.status = winAmount > 0 ? 'win' : 'lose';
            saveBetHistory();
            renderHistory();
            break;
        }
    }
}
function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    if (betHistory.length === 0) {
        container.innerHTML = '<div class="history-empty">No betting history yet.</div>';
        return;
    }
    let html = '';
    for (let h of betHistory) {
        const typeClass = h.type === 'BIG' ? 'big' : 'small';
        const statusClass = h.status;
        const statusLabel = h.status === 'pending' ? '⏳ Pending' : (h.status === 'win' ? '✅ Win' : '❌ Lose');
        const amountDisplay = h.status === 'pending' ? `-${h.amount}` : (h.status === 'win' ? `+${h.winAmount.toFixed(2)}` : `${h.winAmount.toFixed(2)}`);
        html += `
            <div class="history-item" style="border-left-color: ${h.type === 'BIG' ? '#00e676' : '#ff1744'};">
                <span class="h-period">${h.period}</span>
                <span class="h-type ${typeClass}">${h.type}</span>
                <span class="h-amount">${amountDisplay}</span>
                <span class="h-status ${statusClass}">${statusLabel}</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

function getMyanmarTime() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcTime + MYANMAR_OFFSET);
}
function generateSignature(data) {
    const exclude = ["signature", "track", "xosoBettingData"];
    const f = {};
    Object.keys(data).sort().forEach(k => {
        const v = data[k];
        if (v !== null && v !== '' && !exclude.includes(k)) {
            f[k] = v === 0 ? 0 : v;
        }
    });
    const jstr = JSON.stringify(f);
    return CryptoJS.MD5(jstr).toString().toUpperCase();
}
let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById('toastWarning');
    toast.textContent = message || '⚠️ ကျေးဇူးပြု၍ မြှောက်ကိန်း ထည့်ပါ';
    toast.style.display = 'block';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}
function showSuccessToast(message) {
    const toast = document.getElementById('toastSuccess');
    toast.textContent = message || '✅ အောင်မြင်ပါသည်';
    toast.style.display = 'block';
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
function hideToast() {
    if (toastTimeout) clearTimeout(toastTimeout);
    document.getElementById('toastWarning').style.display = 'none';
    document.getElementById('toastSuccess').style.display = 'none';
}
async function performLogin(username, password) {
    const statusEl = document.getElementById('loginStatus');
    const progressEl = document.getElementById('loadingProgress');
    const errorEl = document.getElementById('loginError');
    statusEl.innerText = '⏳ Logging in...';
    progressEl.style.display = 'none';
    errorEl.innerText = '';

    const baseUrl = PLATFORMS[selectedPlatform];
    if (!baseUrl) {
        statusEl.innerText = '⚠️ Invalid platform selected.';
        return false;
    }
    try {
        const loginPayload = {
            username: username,
            pwd: password,
            phonetype: 1,
            logintype: "mobile",
            packId: "",
            deviceId: "5dcab3e06db88a206975e91ea6ac7c87",
            language: 7,
            random: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
        };
        const signature = generateSignature(loginPayload);
        loginPayload.signature = signature;
        loginPayload.timestamp = Math.floor(Date.now() / 1000);
        const res = await fetch(baseUrl + "Login", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json',
                'Ar-Origin': 'https://www.bigwingame.cc',
                'Origin': 'https://www.bigwingame.cc',
                'Referer': 'https://www.bigwingame.cc/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0'
            },
            body: JSON.stringify(loginPayload)
        });
        const data = await res.json();
        if (data.code !== 0) {
            statusEl.innerText = '❌ Login failed: ' + (data.msg || 'unknown');
            errorEl.innerText = 'Please check credentials.';
            return false;
        }
        authToken = data.data.token;
        statusEl.innerText = '✅ Login success. Fetching balance & history...';
        await refreshBalance();
        progressEl.style.display = 'block';
        await fetchAllTRXHistory(progressEl, statusEl);
        document.getElementById('loginOverlay').style.display = 'none';
        loadLocalData();
        startChartLoop();
        return true;
    } catch (e) {
        statusEl.innerText = '⚠️ Network error: ' + e.message;
        errorEl.innerText = 'Check internet connection.';
        console.error(e);
        return false;
    }
}
async function refreshBalance() {
    if (!authToken) return;
    const baseUrl = PLATFORMS[selectedPlatform];
    if (!baseUrl) return;
    try {
        const authHeaders = {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Ar-Origin': 'https://www.bigwingame.cc'
        };
        const balRes = await fetch(baseUrl + "GetBalance", {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ language: 7, random: "2bd6857049ee4aab854ebd14b0329913", signature: "66D8663148FC013C20F2DD8CF2ED2FE6", timestamp: 1781942853 })
        });
        const balData = await balRes.json();
        if (balData.code === 0) {
            localBalance = parseFloat(balData.data.amount) || 0;
            document.getElementById('balanceAmount').innerText = localBalance.toFixed(2);
            document.getElementById('balanceDisplay').style.display = 'flex';
        }
    } catch (e) { console.warn("Failed to refresh balance:", e); }
}
async function fetchAllTRXHistory(progressEl, statusEl) {
    const baseUrl = PLATFORMS[selectedPlatform];
    if (!baseUrl || !authToken) return;
    try {
        const authHeaders = {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Ar-Origin': 'https://www.bigwingame.cc'
        };
        let allGames = [];
        statusEl.innerText = `📥 Loading history candles...`;
        for (let page = 1; page <= 40; page++) {
            const payload = {
                pageSize: 10,
                pageNo: page,
                typeId: 13,
                language: 7,
                random: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
            };
            payload.signature = generateSignature(payload);
            payload.timestamp = Math.floor(Date.now() / 1000);

            progressEl.innerText = `Fetching page ${page}/40... (${allGames.length} items loaded)`;

            const res = await fetch(baseUrl + "GetTRXNoaverageEmerdList", {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (json.code === 0 && json.data?.data?.gameslist && json.data.data.gameslist.length > 0) {
                allGames = [...allGames, ...json.data.data.gameslist];
            } else {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (allGames.length > 0) {
            allGames.sort((a, b) => a.issueNumber.localeCompare(b.issueNumber));
            let newCandles = [];
            let prevClose = 52.0;
            for (let game of allGames) {
                const period = game.issueNumber;
                const number = parseInt(game.number);
                const result = number >= 5 ? 'BIG' : 'SMALL';
                const base = prevClose;
                const isBig = number >= 5;
                let open = base;
                let close = isBig ? open + 0.85 : open - 0.85;
                let wick = 0.12 + Math.random() * 0.2;
                let high = Math.max(open, close) + wick;
                let low = Math.min(open, close) - wick;
                prevClose = close;
                newCandles.push({ period, number, result, open, high, low, close, timestamp: Date.now() });
            }
            if (newCandles.length) {
                candleData = newCandles.slice(-MAX_CANDLES);
                localStorage.setItem(STORAGE_CANDLES, JSON.stringify(candleData));
                updatePatternsBar();
                drawChart();
                scrollToNewest();
            }
        }
        progressEl.style.display = 'none';
        statusEl.innerText = `✅ Loaded ${candleData.length} candles`;
    } catch (e) {
        console.warn('History fetch error:', e);
        statusEl.innerText = '⚠️ History data loading error';
    }
}
async function fetchTRXData() {
    if (!authToken) return;
    const baseUrl = PLATFORMS[selectedPlatform];
    if (!baseUrl) return;
    try {
        const authHeaders = {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'Ar-Origin': 'https://www.bigwingame.cc'
        };
        const payload = {
            pageSize: 10,
            pageNo: 1,
            typeId: 13,
            language: 7,
            random: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
        };
        payload.signature = generateSignature(payload);
        payload.timestamp = Math.floor(Date.now() / 1000);
        const res = await fetch(baseUrl + "GetTRXNoaverageEmerdList", {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.code === 0 && json.data?.data?.gameslist && json.data.data.gameslist.length > 0) {
            const games = json.data.data.gameslist;
            games.sort((a, b) => a.issueNumber.localeCompare(b.issueNumber));

            let updated = false;
            let balanceBefore = localBalance;
            let prevClose = candleData.length > 0 ? candleData[candleData.length - 1].close : 52.0;

            for (let game of games) {
                const period = game.issueNumber;
                const number = parseInt(game.number);
                const result = number >= 5 ? 'BIG' : 'SMALL';
                const exists = candleData.some(c => c.period === period);
                if (!exists) {
                    if (pendingBet && pendingBet.period === period) {
                        const betType = pendingBet.type;
                        const totalBetAmount = pendingBet.amount;
                        const isWin = (result === betType);
                        const winAmount = isWin ? (totalBetAmount * 1.96) : -totalBetAmount;
                        const balanceAfter = balanceBefore + winAmount;
                        showResultPopup(period, number, result, betType, totalBetAmount, balanceBefore, balanceAfter);
                        updateBetHistory(period, result, number, winAmount);
                        localBalance = balanceAfter;
                        document.getElementById('balanceAmount').innerText = localBalance.toFixed(2);
                        pendingBet = null;
                    }
                    const base = prevClose;
                    const isBig = number >= 5;
                    let open = base;
                    let close = isBig ? open + 0.85 : open - 0.85;
                    let wick = 0.12 + Math.random() * 0.2;
                    let high = Math.max(open, close) + wick;
                    let low = Math.min(open, close) - wick;
                    prevClose = close;

                    candleData.push({ period, number, result, open, high, low, close, timestamp: Date.now() });
                    updated = true;
                } else {
                    const lastCandle = candleData[candleData.length - 1];
                    if (lastCandle && lastCandle.period === period) {
                        prevClose = lastCandle.close;
                    }
                }
            }
            if (updated) {
                if (candleData.length > MAX_CANDLES) candleData = candleData.slice(-MAX_CANDLES);
                localStorage.setItem(STORAGE_CANDLES, JSON.stringify(candleData));
                document.getElementById('lastUpdateTime').innerText = new Date().toLocaleTimeString();
                updatePatternsBar();
                scrollToNewest();
                drawChart();
                await refreshBalance();
            }
            const latestGame = games[games.length - 1];
            if (latestGame) {
                const nextPeriod = (BigInt(latestGame.issueNumber) + 1n).toString();
                document.getElementById('nextPeriodDisplay').innerText = nextPeriod;
                const myanmarTime = getMyanmarTime();
                const currentMinute = myanmarTime.getMinutes();
                const nextMinute = currentMinute + 1;
                const nextTimestamp = new Date(myanmarTime);
                nextTimestamp.setSeconds(0);
                nextTimestamp.setMilliseconds(0);
                nextTimestamp.setMinutes(nextMinute);
                nextPeriodTimestamp = nextTimestamp.getTime();
            }
        }
    } catch (e) { console.warn('Fetch TRX data error:', e); }
}
function updateTimer() {
    if (!nextPeriodTimestamp) return;
    const myanmarTime = getMyanmarTime();
    let remain = Math.max(0, nextPeriodTimestamp - myanmarTime.getTime());
    let mins = Math.floor(remain / 60000);
    let secs = Math.floor((remain % 60000) / 1000);
    const timerEl = document.getElementById('countdownTimer');
    if (timerEl) {
        timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        timerEl.classList.remove('warning', 'danger');
        if (remain <= 10000) timerEl.classList.add('danger');
        else if (remain <= 30000) timerEl.classList.add('warning');
    }
    if (secs <= 11 && mins === 0) {
        if (!bettingLocked) {
            bettingLocked = true;
            document.getElementById('betBigBtn').disabled = true;
            document.getElementById('betSmallBtn').disabled = true;
            closeBetModal();
        }
    } else {
        if (bettingLocked) {
            bettingLocked = false;
            document.getElementById('betBigBtn').disabled = false;
            document.getElementById('betSmallBtn').disabled = false;
        }
    }
    if (remain <= 500) fetchTRXData();
}
function openBetModal(selectType) {
    if (bettingLocked) return;
    currentSelectedType = selectType;
    const modalOverlay = document.getElementById('betModalOverlay');
    const headerTitle = document.getElementById('modalHeaderType');
    if (selectType === 13) {
        headerTitle.innerText = "BET BIG";
        headerTitle.className = "modal-header-type big";
    } else {
        headerTitle.innerText = "BET SMALL";
        headerTitle.className = "modal-header-type small";
    }
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
    const defaultBtn = document.querySelector('.amount-btn[data-amount="100"]');
    if (defaultBtn) defaultBtn.classList.add('selected');
    document.getElementById('multValueInput').value = '1';
    currentMultiplier = 1;
    document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
    const preset1 = document.querySelector('.mult-preset[data-mult="1"]');
    if (preset1) preset1.classList.add('active');
    updateTotalBetDisplay();
    modalOverlay.classList.add('active');
    hideToast();
    document.getElementById('multValueInput').blur();
}
function closeBetModal() {
    document.getElementById('multValueInput').blur();
    document.getElementById('betModalOverlay').classList.remove('active');
    hideToast();
}
function updateTotalBetDisplay() {
    const multInput = document.getElementById('multValueInput');
    let val = parseInt(multInput.value);
    if (isNaN(val) || val < 1) {
        currentMultiplier = 0;
        document.getElementById('totalBetDisplay').innerText = '0 ကျပ်';
        return;
    }
    currentMultiplier = val;
    const selected = document.querySelector('.amount-btn.selected');
    let baseAmount = 100;
    if (selected) { baseAmount = parseInt(selected.dataset.amount); }
    const total = baseAmount * currentMultiplier;
    document.getElementById('totalBetDisplay').innerText = `${total.toLocaleString()} ကျပ်`;
    
    document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
    const match = document.querySelector(`.mult-preset[data-mult="${val}"]`);
    if (match) match.classList.add('active');
}
async function confirmAndExecuteBet() {
    const nextPeriod = document.getElementById('nextPeriodDisplay').innerText;
    if (!authToken) { alert("⚠️ Token မရှိပါ။ ကျေးဇူးပြု၍ အကောင့်ပြန်ဝင်ပါ။"); return; }
    if (nextPeriod === "--") { alert("⚠️ Period Number မရရှိသေးပါ။"); return; }
    const multInput = document.getElementById('multValueInput');
    const inputValue = multInput.value.trim();        
    if (inputValue === '') {
        showToast('⚠️ ကျေးဇူးပြု၍ မြှောက်ကိန်း ထည့်ပါ');
        multInput.focus();
        return;
    }        
    let multiplier = parseInt(inputValue);
    if (isNaN(multiplier) || multiplier < 1) {
        showToast('⚠️ ကျေးဇူးပြု၍ မှန်ကန်သော ဂဏန်း ထည့်ပါ');
        multInput.focus();
        return;
    }
    currentMultiplier = multiplier;
    const selected = document.querySelector('.amount-btn.selected');
    let baseAmount = 100;
    if (selected) { baseAmount = parseInt(selected.dataset.amount); }
    const totalAmount = baseAmount * multiplier;
    if (totalAmount > localBalance) {
        showToast(`⚠️ Balance မလောက်ပါ။ လက်ကျန်: ${localBalance.toFixed(2)} ကျပ်`);
        return;
    }
    closeBetModal();
    hideToast();
    const betType = currentSelectedType === 13 ? 'BIG' : 'SMALL';
 
    addBetHistory({
        period: nextPeriod,
        type: betType,
        amount: totalAmount,
        status: 'pending',
        result: null,
        number: null,
        winAmount: null
    });

    if (pendingBet && pendingBet.period === nextPeriod) {
        pendingBet.amount += totalAmount;
        pendingBet.count = (pendingBet.count || 1) + 1;
    } else {
        pendingBet = { type: betType, amount: totalAmount, period: nextPeriod, count: 1 };
    }
    const baseUrl = PLATFORMS[selectedPlatform];
    if (!baseUrl) { alert("Platform not selected"); return; }
    try {
        const payload = {
            typeId: 13,
            issuenumber: nextPeriod,
            language: 7,
            gameType: 2,
            amount: baseAmount,
            betCount: multiplier,
            selectType: currentSelectedType,
            random: CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex)
        };
        const signature = generateSignature(payload);
        payload.signature = signature;
        payload.timestamp = Math.floor(Date.now() / 1000);
        const res = await fetch(baseUrl + "GameTrxBetting", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json, text/plain, */*',
                'Authorization': `Bearer ${authToken}`,
                'Ar-Origin': 'https://www.bigwingame.cc',
                'Origin': 'https://www.bigwingame.cc',
                'Referer': 'https://www.bigwingame.cc/',
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.code === 0) {
            localBalance -= totalAmount;
            document.getElementById('balanceAmount').innerText = localBalance.toFixed(2);     
            showSuccessToast(`✅ အောင်မြင်ပါသည်\nPeriod: ${nextPeriod}\n${betType}: ${baseAmount} × ${multiplier} = ${totalAmount} ကျပ်`);
            await refreshBalance();
        } else {
            showToast(`❌ လောင်းကြေး မအောင်မြင်ပါ: ${data.msg || 'Unknown Error'}`);
            betHistory = betHistory.filter(h => !(h.period === nextPeriod && h.status === 'pending'));
            saveBetHistory();
            renderHistory();
            if (pendingBet && pendingBet.period === nextPeriod) {
                pendingBet.amount -= totalAmount;
                if (pendingBet.amount <= 0 || pendingBet.count <= 1) pendingBet = null;
                else pendingBet.count -= 1;
            }
        }
    } catch (e) {
        showToast(`⚠️ Error: ${e.message}`);
        console.error(e);
    }
}
function showResultPopup(period, number, result, betType, totalBetAmount, balanceBefore, balanceAfter) {
    const popup = document.getElementById('resultPopup');
    const resultStatus = document.getElementById('resultStatus');
    const numDisplay = document.getElementById('resultNumberDisplay');
    const colorBadge = document.getElementById('resultColorBadge');
    const title = document.getElementById('resultTitle');
    const periodEl = document.getElementById('resultPeriod');
    const balanceChange = document.getElementById('resultBalanceChange');

    const isWin = (result === betType);
    if (isWin) {
        resultStatus.innerText = "✅ အနိုင်ရရှိပါသည်";
        resultStatus.style.color = "#00e676";
    } else {
        resultStatus.innerText = "❌ အရှုံးပေါ်ပါသည်";
        resultStatus.style.color = "#ff1744";
    }
    let colorName = ""; let colorStyle = "";
    if ([1, 3, 7, 9].includes(number)) { colorName = "GREEN"; colorStyle = "background: #00e676; color: #fff;"; }
    else if ([2, 4, 6, 8].includes(number)) { colorName = "RED"; colorStyle = "background: #ff1744; color: #fff;"; }
    else if (number === 5) { colorName = "VIOLET/GREEN"; colorStyle = "background: linear-gradient(90deg, #d500f9 50%, #00e676 50%); color: #fff;"; }
    else if (number === 0) { colorName = "RED/VIOLET"; colorStyle = "background: linear-gradient(90deg, #ff1744 50%, #d500f9 50%); color: #fff;"; }
    
    numDisplay.innerText = number;
    colorBadge.innerText = colorName;
    colorBadge.setAttribute("style", colorStyle);
    title.innerText = result;
    periodEl.innerText = `Period: ${period}`;
    const winAmount = isWin ? (totalBetAmount * 1.96) : -totalBetAmount;
    balanceChange.innerText = `${isWin ? '+' : ''}${winAmount.toFixed(2)} ကျပ်`;
    balanceChange.style.color = isWin ? '#ffd700' : '#ff1744';        
    const rotatedView = document.body.classList.contains('rotated-view');
    popup.style.display = rotatedView ? 'flex' : 'block';
}
function closeResultPopup() { document.getElementById('resultPopup').style.display = 'none'; }

function detectPatternsForIndex(idx) {
    if (idx < 2 || idx >= candleData.length) return [];
    const c = candleData[idx]; const c1 = candleData[idx - 1]; const c2 = candleData[idx - 2];
    let patterns = [];
    if (c1.result === 'SMALL' && c.result === 'BIG' && c.close > c1.open && c.open < c1.close) patterns.push({ name: 'Bull Engulf', type: 'bullish' });
    if (c1.result === 'BIG' && c.result === 'SMALL' && c.close < c1.open && c.open > c1.close) patterns.push({ name: 'Bear Engulf', type: 'bearish' });
    const body = Math.abs(c.close - c.open); const lowerShadow = Math.min(c.open, c.close) - c.low; const upperShadow = c.high - Math.max(c.open, c.close);
    if (c.result === 'SMALL' && lowerShadow > body * 2 && upperShadow < body * 0.4) patterns.push({ name: 'Hammer', type: 'bullish' });
    if (c.result === 'BIG' && upperShadow > body * 2 && lowerShadow < body * 0.4) patterns.push({ name: 'Shooting Star', type: 'bearish' });
    if (Math.abs(c.close - c.open) < (c.high - c.low) * 0.15) patterns.push({ name: 'Doji', type: 'neutral' });
    return patterns.slice(0, 4);
}
function updatePatternsBar() {
    if (!candleData.length) return;
    const patterns = detectPatternsForIndex(candleData.length - 1);
    const container = document.getElementById('patternListArea');
    if (!container) return;
    if (patterns.length === 0) { container.innerHTML = '<span class="pattern-badge pattern-neutral">No Pattern</span>'; }
    else {
        let html = '';
        patterns.forEach(p => {
            let cls = p.type === 'bullish' ? 'pattern-bullish' : (p.type === 'bearish' ? 'pattern-bearish' : 'pattern-neutral');
            html += `<span class="pattern-badge ${cls}">${p.name}</span>`;
        });
        container.innerHTML = html;
    }
}
function getTrendAndMomentum(idx) {
    if (idx < 2 || candleData.length < 5) return { trend: 'Neutral', momentum: 'Neutral' };
    const recent = candleData.slice(Math.max(0, idx - 4), idx + 1);
    let upCount = recent.filter(c => c.result === 'BIG').length;
    let downCount = recent.filter(c => c.result === 'SMALL').length;
    let trend = upCount > downCount + 1 ? 'Bullish' : (downCount > upCount + 1 ? 'Bearish' : 'Neutral');
    let momentum = trend === 'Bullish' ? 'Up' : (trend === 'Bearish' ? 'Down' : 'Sideways');
    return { trend, momentum };
}
function getCandleWidth(customScale = scale) {
    let base = 9.5 * customScale;
    if (isVerticalView) base = base * 0.62;
    return base;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath(); ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
function formatPeriodLabel(period) {
    const s = String(period ?? '');
    if (s.length >= 4) { return s.slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2'); }
    return s || '-';
}

function drawChart() {
    if (!ctx || chartWidth === 0 || chartHeight === 0) return;
    ctx.clearRect(0, 0, chartWidth, chartHeight);
    const bg = ctx.createLinearGradient(0, 0, 0, chartHeight);
    bg.addColorStop(0, '#07080b'); bg.addColorStop(1, '#0b0d12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, chartWidth, chartHeight);
    if (candleData.length === 0) {
        ctx.fillStyle = '#666'; ctx.font = '14px Inter'; ctx.textAlign = 'center';
        ctx.fillText('No TRX data yet. Login to load history.', chartWidth / 2, chartHeight / 2);
        return;
    }
    const PRICE_AXIS_W = 74; const topPad = 14; const bottomPad = 22;
    const volH = Math.max(32, Math.min(52, Math.floor(chartHeight * 0.18)));
    const plotW = chartWidth - PRICE_AXIS_W;
    const plotH = Math.max(40, chartHeight - topPad - bottomPad - volH);
    const plotTop = topPad; const plotBottom = plotTop + plotH;
    const volTop = plotBottom + 10; const volBottom = chartHeight - bottomPad;

    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(plotW, 0, PRICE_AXIS_W, chartHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plotW + 0.5, 0); ctx.lineTo(plotW + 0.5, chartHeight); ctx.stroke();

    const candleW = getCandleWidth(); const gap = Math.max(1, candleW * 0.12); const totalStep = candleW + gap;
    let firstVisible = 0; let lastVisible = candleData.length - 1;

    for (let i = 0; i < candleData.length; i++) {
        const x = offsetX + (i * totalStep) + (candleW / 2);
        if (x + candleW / 2 >= 0) { firstVisible = i; break; }
    }
    for (let i = candleData.length - 1; i >= 0; i--) {
        const x = offsetX + (i * totalStep) + (candleW / 2);
        if (x - candleW / 2 <= plotW) { lastVisible = i; break; }
    }
    if (lastVisible < firstVisible) { firstVisible = 0; lastVisible = candleData.length - 1; }

    let minPrice = Infinity, maxPrice = -Infinity; let maxVol = 1;
    for (let i = firstVisible; i <= lastVisible; i++) {
        const c = candleData[i];
        if (c.high > maxPrice) maxPrice = c.high;
        if (c.low < minPrice) minPrice = c.low;
        const v = (c.high - c.low) + Math.abs(c.close - c.open);
        if (v > maxVol) maxVol = v;
    }
    if (!isFinite(minPrice) || !isFinite(maxPrice)) return;
    const padding = (maxPrice - minPrice) * 0.006 || 1;
    minPrice -= padding; maxPrice += padding;
    const priceRange = maxPrice - minPrice || 1;
    const priceToY = (price) => plotTop + plotH - ((price - minPrice) / priceRange) * plotH;
    const yToPrice = (y) => minPrice + ((plotTop + plotH - y) / plotH) * priceRange;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    const hLines = 6;
    for (let i = 0; i <= hLines; i++) {
        const y = plotTop + (i * plotH / hLines);
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(plotW, y + 0.5); ctx.stroke();
    }
    const approxCols = Math.max(6, Math.floor(plotW / 120)); const colStepPx = plotW / approxCols;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    for (let x = 0; x <= plotW; x += colStepPx) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, plotTop); ctx.lineTo(x + 0.5, plotBottom); ctx.stroke();
    }

    ctx.font = '10px Inter';
    for (let i = 0; i <= hLines; i++) {
        const y = plotTop + (i * plotH / hLines); const price = maxPrice - (i * priceRange / hLines);
        const txt = price.toFixed(3); const tx = plotW + 10; const ty = y - 9;
        const boxW = PRICE_AXIS_W - 18; const boxH = 16;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, tx, ty, boxW, boxH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#cfd8dc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, tx + 7, ty + boxH / 2);
    }

    const drawMA = (period, color, dashed = false) => {
        if (candleData.length < period) return;
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.6;
        if (dashed) ctx.setLineDash([5, 4]);
        let first = true;
        for (let i = period - 1; i < candleData.length; i++) {
            let sum = 0; for (let j = 0; j < period; j++) sum += candleData[i - j].close;
            const x = offsetX + (i * totalStep) + (candleW / 2);
            if (x < -50 || x > plotW + 50) continue;
            const y = priceToY(sum / period);
            if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
    };
    drawMA(5, 'rgba(255, 217, 102, 0.95)', true);
    drawMA(20, 'rgba(79, 195, 247, 0.75)', false);

    for (let i = firstVisible; i <= lastVisible; i++) {
        const c = candleData[i]; const x = offsetX + (i * totalStep) + (candleW / 2);
        if (x + candleW / 2 < 0 || x - candleW / 2 > plotW) continue;
        const isUp = c.close >= c.open;
        const bodyFill = isUp ? 'rgba(0, 230, 118, 0.16)' : 'rgba(255, 23, 68, 0.90)';
        const bodyStroke = isUp ? 'rgba(0, 230, 118, 0.95)' : 'rgba(255, 23, 68, 0.95)';
        const wickColor = isUp ? 'rgba(0, 230, 118, 0.85)' : 'rgba(255, 23, 68, 0.85)';
        const highY = priceToY(c.high); const lowY = priceToY(c.low);
        const openY = priceToY(c.open); const closeY = priceToY(c.close);

        ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY);
        ctx.strokeStyle = wickColor; ctx.lineWidth = Math.max(1.2, 1.2 * scale); ctx.stroke();

        const bodyTop = Math.min(openY, closeY); const bodyH = Math.max(2, Math.abs(closeY - openY));
        const bodyX = x - candleW / 2; const bodyY = bodyTop;
        const r = Math.max(2, Math.min(5, candleW * 0.25));

        ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = isUp ? 'rgba(0,230,118,0.12)' : 'rgba(255,23,68,0.12)';
        ctx.fillStyle = bodyFill; roundRect(ctx, bodyX, bodyY, candleW, bodyH, r); ctx.fill(); ctx.restore();

        ctx.strokeStyle = bodyStroke; ctx.lineWidth = Math.max(1.2, 1.2 * scale);
        roundRect(ctx, bodyX + 0.5, bodyY + 0.5, candleW - 1, bodyH - 1, r); ctx.stroke();

        ctx.font = `800 ${Math.max(9, Math.min(12, candleW * 0.62))}px "Courier New"`;
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(String(c.number ?? ''), x, lowY - 4);

        const volVal = (c.high - c.low) + Math.abs(c.close - c.open); const volBarH = (volVal / maxVol) * (volBottom - volTop);
        ctx.fillStyle = isUp ? 'rgba(0,230,118,0.25)' : 'rgba(255,23,68,0.25)';
        ctx.fillRect(x - candleW / 2, volBottom - volBarH, candleW, volBarH);

        if (i === hoveredIndex && showCrosshair) {
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
            roundRect(ctx, bodyX - 2, bodyY - 2, candleW + 4, bodyH + 4, r + 2); ctx.stroke();
        }
    }
    const last = candleData[candleData.length - 1];
    if (last) {
        const lastY = priceToY(last.close);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(0, lastY + 0.5); ctx.lineTo(plotW, lastY + 0.5); ctx.stroke(); ctx.setLineDash([]);
        const txt = last.close.toFixed(3); const bx = plotW + 10; const by = clamp(lastY - 9, 6, chartHeight - 22);
        const bw = PRICE_AXIS_W - 18; const bh = 16;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        roundRect(ctx, bx, by, bw, bh, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + 7, by + bh / 2);
    }
    if (hoveredIndex >= 0 && showCrosshair) {
        const cx = clamp(lastMouseX, 0, plotW); const cy = clamp(lastMouseY, plotTop, plotBottom);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.moveTo(cx + 0.5, plotTop); ctx.lineTo(cx + 0.5, volBottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(plotW, cy + 0.5); ctx.stroke(); ctx.setLineDash([]);
        
        const p = yToPrice(cy); const pTxt = p.toFixed(3); const bx = plotW + 10; const by = clamp(cy - 9, 6, chartHeight - 22);
        const bw = PRICE_AXIS_W - 18; const bh = 16;
        ctx.fillStyle = 'rgba(21,101,192,0.35)'; ctx.strokeStyle = 'rgba(79,195,247,0.35)';
        roundRect(ctx, bx, by, bw, bh, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e3f2fd'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(pTxt, bx + 7, by + bh / 2);
        
        const c = candleData[hoveredIndex];
        if (c) {
            const tTxt = formatPeriodLabel(c.period); const tw = ctx.measureText(tTxt).width;
            const tbw = tw + 16; const tbh = 16; const tbx = clamp(cx - tbw / 2, 6, plotW - tbw - 6); const tby = volBottom - 10;
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            roundRect(ctx, tbx, tby, tbw, tbh, 7); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#cfd8dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(tTxt, tbx + tbw / 2, tby + tbh / 2);
        }
    }
}
function resizeCanvasAndDraw() {
    const container = document.getElementById('chartContainer');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (isVerticalView) { chartWidth = rect.height; chartHeight = rect.width; }
    else { chartWidth = rect.width; chartHeight = rect.height; }
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = chartWidth + 'px'; canvas.style.height = chartHeight + 'px';
    canvas.width = Math.floor(chartWidth * dpr); canvas.height = Math.floor(chartHeight * dpr);
    ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart();
}
function scrollToNewest() {
    if (!candleData.length) { offsetX = 40; drawChart(); return; }
    const PRICE_AXIS_W = 74; const plotW = chartWidth - PRICE_AXIS_W;
    const candleW = getCandleWidth(); const gap = Math.max(1, candleW * 0.12); const totalStep = candleW + gap;
    offsetX = plotW - (candleData.length * totalStep) - 16;
    if (offsetX > 40) offsetX = 40;
    drawChart();
}
function loadLocalData() {
    const stored = localStorage.getItem(STORAGE_CANDLES);
    if (stored) {
        try { candleData = JSON.parse(stored); updatePatternsBar(); drawChart(); scrollToNewest(); } catch (e) { }
    }
    loadBetHistory(); renderHistory();
}
function setupInteractions() {
    canvas.addEventListener('mousemove', (e) => {
        if (!showCrosshair) return;
        const rect = canvas.getBoundingClientRect();
        let mouseX, mouseY;
        if (isVerticalView) { mouseX = e.clientY - rect.top; mouseY = chartHeight - (e.clientX - rect.left); }
        else { mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top; }
        const PRICE_AXIS_W = 74; const plotW = chartWidth - PRICE_AXIS_W;
        lastMouseX = clamp(mouseX, 0, plotW); lastMouseY = clamp(mouseY, 0, chartHeight);
        if (mouseX > plotW) { hoveredIndex = -1; document.getElementById('chartTooltip').style.display = 'none'; drawChart(); return; }
        const candleW = getCandleWidth(); const gap = Math.max(1, candleW * 0.12); const totalStep = candleW + gap;
        let idx = Math.round(((mouseX - offsetX) - candleW / 2) / totalStep);
        if (idx >= 0 && idx < candleData.length) { hoveredIndex = idx; showTooltip(mouseX, mouseY, candleData[idx]); }
        else { hoveredIndex = -1; document.getElementById('chartTooltip').style.display = 'none'; drawChart(); }
        drawChart();
    });
    canvas.addEventListener('mouseleave', () => { hoveredIndex = -1; document.getElementById('chartTooltip').style.display = 'none'; drawChart(); });
    canvas.addEventListener('mousedown', (e) => { isDragging = true; lastDragX = isVerticalView ? e.clientY : e.clientX; canvas.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', (e) => {
        if (isDragging) { const currentX = isVerticalView ? e.clientY : e.clientX; offsetX += (currentX - lastDragX); lastDragX = currentX; drawChart(); }
    });
    window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('touchstart', (e) => { isDragging = true; const touch = e.touches[0]; lastDragX = isVerticalView ? touch.clientY : touch.clientX; });
    canvas.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0]; const currentX = isVerticalView ? touch.clientY : touch.clientX;
        offsetX += (currentX - lastDragX); lastDragX = currentX; drawChart();
    });
    canvas.addEventListener('touchend', () => { isDragging = false; });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault(); const rect = canvas.getBoundingClientRect();
        let mouseX = isVerticalView ? (e.clientY - rect.top) : (e.clientX - rect.left);
        const PRICE_AXIS_W = 74; const plotW = chartWidth - PRICE_AXIS_W; mouseX = clamp(mouseX, 0, plotW);
        const oldScale = scale; const oldCandleW = getCandleWidth(oldScale); const oldGap = Math.max(1, oldCandleW * 0.12); const oldStep = oldCandleW + oldGap;
        const idxFloat = ((mouseX - offsetX) - oldCandleW / 2) / oldStep;
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08; scale = clamp(scale * zoomFactor, 0.55, 2.4);
        const newCandleW = getCandleWidth(scale); const newGap = Math.max(1, newCandleW * 0.12); const newStep = newCandleW + newGap;
        offsetX = mouseX - (idxFloat * newStep + newCandleW / 2); drawChart();
    }, { passive: false });

    document.getElementById('betBigBtn').onclick = () => openBetModal(13);
    document.getElementById('betSmallBtn').onclick = () => openBetModal(14);
    const amountBtns = document.querySelectorAll('.amount-btn');
    amountBtns.forEach(btn => {
        btn.onclick = (e) => { amountBtns.forEach(b => b.classList.remove('selected')); e.target.classList.add('selected'); updateTotalBetDisplay(); };
    });
    const multInput = document.getElementById('multValueInput');
    multInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        if (this.value === '') {
            currentMultiplier = 0; document.getElementById('totalBetDisplay').innerText = '0 ကျပ်';
            document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active')); return;
        }
        let val = parseInt(this.value);
        if (!isNaN(val) && val >= 1) {
            document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
            const match = document.querySelector(`.mult-preset[data-mult="${val}"]`);
            if (match) match.classList.add('active');
            updateTotalBetDisplay();
        }
    });
    document.getElementById('multMinus').onclick = () => {
        const multInput = document.getElementById('multValueInput'); let val = parseInt(multInput.value);
        if (isNaN(val) || val <= 1) {
            multInput.value = ''; currentMultiplier = 0; document.getElementById('totalBetDisplay').innerText = '0 ကျပ်';
            document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
        } else {
            val--; multInput.value = val.toString(); document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
            const match = document.querySelector(`.mult-preset[data-mult="${val}"]`); if (match) match.classList.add('active');
            updateTotalBetDisplay();
        }
        multInput.focus();
    };
    document.getElementById('multPlus').onclick = () => {
        const multInput = document.getElementById('multValueInput'); let val = parseInt(multInput.value);
        if (isNaN(val) || val < 1) { val = 1; } else { val++; }
        multInput.value = val.toString(); document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
        const match = document.querySelector(`.mult-preset[data-mult="${val}"]`); if (match) match.classList.add('active');
        updateTotalBetDisplay();
    };
    document.querySelectorAll('.mult-preset').forEach(preset => {
        preset.onclick = function() {
            const val = parseInt(this.dataset.mult); document.getElementById('multValueInput').value = val.toString();
            document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active')); this.classList.add('active');
            updateTotalBetDisplay();
        };
    });
    document.getElementById('modalCancelBtn').onclick = () => closeBetModal();
    document.getElementById('modalConfirmBtn').onclick = () => confirmAndExecuteBet();
    document.getElementById('historyToggleBtn').onclick = () => { const panel = document.getElementById('historyPanel'); panel.classList.toggle('active'); renderHistory(); };
    document.getElementById('historyCloseBtn').onclick = () => { document.getElementById('historyPanel').classList.remove('active'); };
    document.getElementById('historyPanel').addEventListener('click', (e) => { if (e.target === e.currentTarget) { document.getElementById('historyPanel').classList.remove('active'); } });
}
function showTooltip(x, y, candle) {
    const tooltip = document.getElementById('chartTooltip');
    let left = x + 15; let top = y - 80;
    if (left > chartWidth - 200) left = x - 210; if (top < 30) top = y + 20;
    if (isVerticalView) { tooltip.style.left = (y + 15) + 'px'; tooltip.style.top = (chartWidth - x - 80) + 'px'; }
    else { tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; }
    tooltip.style.display = 'block';
    document.getElementById('tooltipPeriod').innerText = candle.period;
    document.getElementById('tooltipOpen').innerText = candle.open.toFixed(3);
    document.getElementById('tooltipHigh').innerText = candle.high.toFixed(3);
    document.getElementById('tooltipLow').innerText = candle.low.toFixed(3);
    document.getElementById('tooltipClose').innerText = candle.close.toFixed(3);
    document.getElementById('tooltipNumber').innerText = candle.number;
    let rS = document.getElementById('tooltipResult'); rS.innerText = candle.result;
    rS.style.color = candle.result === 'BIG' ? '#00e676' : '#ff1744';
    const idx = candleData.findIndex(c => c.period === candle.period);
    const ta = idx !== -1 ? getTrendAndMomentum(idx) : { trend: '--', momentum: '--' };
    document.getElementById('tooltipTrend').innerText = ta.trend;
    document.getElementById('tooltipMomentum').innerText = ta.momentum;
}
function startChartLoop() {
    if (apiInterval) clearInterval(apiInterval); if (timerInterval) clearInterval(timerInterval);
    apiInterval = setInterval(fetchTRXData, 2000); timerInterval = setInterval(updateTimer, 1000);
    fetchTRXData();
}

document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', async function () {
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active')); this.classList.add('active');
        selectedPlatform = this.dataset.platform;          
        const u = document.getElementById('loginUsername').value.trim(); const p = document.getElementById('loginPassword').value.trim();
        if (!u || !p) { document.getElementById('loginStatus').innerText = '⚠️ Username/Password ထည့်ပါ။'; return; }
        await performLogin(u, p);
    });
});

window.addEventListener('load', () => {
    const phoneEl = document.getElementById('loginUsername');
    if (phoneEl) {
        if (!phoneEl.value) phoneEl.value = '95';
        const ensurePrefix = () => {
            const v = (phoneEl.value || '').replace(/\s+/g, '');
            if (!v.startsWith('95')) phoneEl.value = '95' + v.replace(/^0+/, '');
            if (phoneEl.value === '95') phoneEl.setSelectionRange(2, 2);
        };
        phoneEl.addEventListener('focus', () => { ensurePrefix(); requestAnimationFrame(() => phoneEl.setSelectionRange(phoneEl.value.length, phoneEl.value.length)); });
        phoneEl.addEventListener('input', () => { phoneEl.value = (phoneEl.value || '').replace(/[^0-9]/g, ''); ensurePrefix(); });
    }
    canvas = document.getElementById('candleChart'); isVerticalView = true;
    const dashboard = document.getElementById('mainDashboard'); dashboard.classList.add('rotated');
    document.body.classList.add('rotated-view');
    dashboard.style.position = 'fixed'; dashboard.style.top = '0'; dashboard.style.left = '0';
    dashboard.style.width = window.innerHeight + 'px'; dashboard.style.height = window.innerWidth + 'px';
    dashboard.style.transform = 'rotate(90deg) translateY(-100%)'; dashboard.style.transformOrigin = 'top left';        
    
    resizeCanvasAndDraw();
    window.addEventListener('resize', () => { resizeCanvasAndDraw(); scrollToNewest(); });
    setupInteractions();
    document.querySelector('.amount-btn').classList.add('selected');
    document.getElementById('multValueInput').value = '';
    document.querySelectorAll('.mult-preset').forEach(p => p.classList.remove('active'));
    document.getElementById('totalBetDisplay').innerText = '0 ကျပ်';
    loadBetHistory(); renderHistory();
});

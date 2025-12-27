// ============================================
// SEI Кошелек - Полностью рабочая версия (с VPN)
// Использует реальные библиотеки CosmJS
// ============================================

// Конфигурация сети
const NETWORK_CONFIG = {
    chainId: 'pacific-1',
    rpc: 'https://sei-rpc.polkachu.com',
    rest: 'https://sei-api.polkachu.com',
    denom: 'usei',
    coinDenom: 'SEI',
    bech32Prefix: 'sei',
    decimals: 6
};

// Глобальные переменные
let currentWallet = null;
let walletName = 'Мой кошелек';
let seiPrice = 0;
let currentBalance = 0;
let isCosmJSLoaded = false;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('SEI Кошелек инициализируется...');
    
    try {
        // Ждем загрузки библиотек CosmJS
        await waitForCosmJS();
        
        // Проверяем сеть
        await checkNetworkStatus();
        
        // Проверяем сохраненный кошелек
        await checkSavedWallet();
        
        // Загружаем цену SEI
        await loadSeiPrice();
        
        // Настраиваем обработчики
        setupEventListeners();
        
        showNotification('SEI Кошелек готов к работе!', 'success');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showNotification('Ошибка загрузки библиотек. Пожалуйста, убедитесь что VPN включен.', 'error');
    }
});

async function waitForCosmJS() {
    console.log('Ожидание загрузки CosmJS...');
    
    // Ждем 2 секунды для загрузки всех скриптов
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Проверяем наличие библиотек
    if (typeof window.cosmjsProtoSigning === 'undefined') {
        throw new Error('Библиотеки CosmJS не загрузились. Проверьте VPN подключение.');
    }
    
    // Устанавливаем глобальные ссылки
    window.DirectSecp256k1HdWallet = window.cosmjsProtoSigning.DirectSecp256k1HdWallet;
    window.SigningStargateClient = window.cosmjsStargate.SigningStargateClient;
    
    isCosmJSLoaded = true;
    console.log('CosmJS успешно загружен');
}

// ============================================
// СЕТЕВЫЕ ФУНКЦИИ
// ============================================

async function checkNetworkStatus() {
    try {
        const statusDot = document.getElementById('networkStatus');
        const statusText = document.getElementById('networkStatusText');
        
        statusDot.className = 'status-dot';
        statusText.textContent = 'Проверка сети...';
        
        const response = await axios.get(`${NETWORK_CONFIG.rpc}/status`, { 
            timeout: 5000 
        });
        
        console.log('Сеть SEI доступна:', response.data);
        
        if (response.data && response.data.node_info) {
            statusDot.className = 'status-dot';
            statusText.textContent = `Сеть ${NETWORK_CONFIG.chainId} онлайн`;
            return true;
        }
        
        throw new Error('Неверный ответ от сети');
        
    } catch (error) {
        console.error('Ошибка проверки сети:', error);
        document.getElementById('networkStatus').className = 'status-dot offline';
        document.getElementById('networkStatusText').textContent = 'Сеть недоступна';
        showNotification('Не удалось подключиться к сети SEI', 'error');
        return false;
    }
}

async function loadSeiPrice() {
    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=sei-network&vs_currencies=usd',
            { timeout: 5000 }
        );
        seiPrice = response.data['sei-network']?.usd || 0.111609;
        console.log('Цена SEI загружена:', seiPrice, 'USD');
    } catch (error) {
        console.warn('Ошибка загрузки цены SEI:', error.message);
        seiPrice = 0.111609;
    }
}

// ============================================
// СОЗДАНИЕ КОШЕЛЬКА
// ============================================

async function createNewWallet() {
    try {
        if (!isCosmJSLoaded) {
            throw new Error('Библиотеки CosmJS не загружены');
        }
        
        const name = document.getElementById('newWalletName').value.trim() || 'Мой SEI кошелек';
        const password = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Валидация
        if (password.length < 8) {
            showNotification('Пароль должен быть минимум 8 символов', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }
        
        showNotification('Создание кошелька...', 'info');
        
        // Генерация мнемонической фразы с помощью CosmJS
        const wallet = await window.DirectSecp256k1HdWallet.generate(12, {
            prefix: NETWORK_CONFIG.bech32Prefix
        });
        
        // Получаем мнемоническую фразу и адрес
        const mnemonic = await wallet.mnemonic;
        const accounts = await wallet.getAccounts();
        const address = accounts[0].address;
        
        console.log('Создан кошелек с адресом:', address);
        
        // Сохраняем кошелек
        const walletData = {
            name: name,
            address: address,
            mnemonic: mnemonic, // В реальном приложении нужно шифровать!
            createdAt: new Date().toISOString(),
            network: NETWORK_CONFIG.chainId
        };
        
        localStorage.setItem('sei_wallet', JSON.stringify(walletData));
        
        // Обновляем интерфейс
        currentWallet = wallet;
        walletName = name;
        
        updateUI();
        await updateBalance();
        
        hideModal('createModal');
        
        // Очищаем форму
        document.getElementById('newWalletName').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        // Показываем мнемоническую фразу
        showBackupDataDirect(mnemonic, address);
        
        showNotification('Кошелек успешно создан!', 'success');
        
    } catch (error) {
        console.error('Ошибка создания кошелька:', error);
        showNotification('Ошибка создания кошелька: ' + error.message, 'error');
    }
}

// ============================================
// ИМПОРТ КОШЕЛЬКА
// ============================================

async function importWallet() {
    try {
        if (!isCosmJSLoaded) {
            throw new Error('Библиотеки CosmJS не загружены');
        }
        
        const mnemonic = document.getElementById('importMnemonic').value.trim();
        const name = document.getElementById('importWalletName').value.trim() || 'Импортированный кошелек';
        
        if (!mnemonic) {
            showNotification('Введите мнемоническую фразу', 'error');
            return;
        }
        
        const wordCount = mnemonic.split(' ').length;
        if (wordCount !== 12 && wordCount !== 24) {
            showNotification('Мнемоническая фраза должна содержать 12 или 24 слова', 'error');
            return;
        }
        
        showNotification('Импорт кошелька...', 'info');
        
        // Создаем кошелек из мнемонической фразы
        const wallet = await window.DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
            prefix: NETWORK_CONFIG.bech32Prefix
        });
        
        const accounts = await wallet.getAccounts();
        const address = accounts[0].address;
        
        console.log('Импортирован кошелек с адресом:', address);
        
        // Сохраняем
        const walletData = {
            name: name,
            address: address,
            mnemonic: mnemonic,
            importedAt: new Date().toISOString(),
            network: NETWORK_CONFIG.chainId
        };
        
        localStorage.setItem('sei_wallet', JSON.stringify(walletData));
        
        // Обновляем интерфейс
        currentWallet = wallet;
        walletName = name;
        
        updateUI();
        await updateBalance();
        
        hideModal('importModal');
        
        // Очищаем форму
        document.getElementById('importMnemonic').value = '';
        document.getElementById('importWalletName').value = '';
        
        showNotification('Кошелек успешно импортирован!', 'success');
        
    } catch (error) {
        console.error('Ошибка импорта:', error);
        showNotification('Неверная мнемоническая фраза: ' + error.message, 'error');
    }
}

// ============================================
// ВОССТАНОВЛЕНИЕ КОШЕЛЬКА
// ============================================

async function checkSavedWallet() {
    try {
        const walletDataStr = localStorage.getItem('sei_wallet');
        if (!walletDataStr) {
            console.log('Сохраненный кошелек не найден');
            return;
        }
        
        const data = JSON.parse(walletDataStr);
        console.log('Найден сохраненный кошелек:', data.address);
        
        if (!data.mnemonic) {
            showNotification('Кошелек не может быть восстановлен без мнемонической фразы', 'warning');
            return;
        }
        
        showNotification('Восстановление кошелька...', 'info');
        
        if (!isCosmJSLoaded) {
            throw new Error('Библиотеки CosmJS не загружены');
        }
        
        // Восстанавливаем кошелек
        const wallet = await window.DirectSecp256k1HdWallet.fromMnemonic(data.mnemonic, {
            prefix: NETWORK_CONFIG.bech32Prefix
        });
        
        currentWallet = wallet;
        walletName = data.name || 'Мой кошелек';
        
        updateUI();
        await updateBalance();
        
        console.log('Кошелек успешно восстановлен');
        showNotification(`Кошелек "${walletName}" восстановлен`, 'success');
        
    } catch (error) {
        console.error('Ошибка восстановления кошелька:', error);
        showNotification('Ошибка восстановления кошелька. Создайте новый.', 'warning');
    }
}

// ============================================
// РАБОТА С БАЛАНСОМ
// ============================================

async function updateBalance() {
    if (!currentWallet) {
        currentBalance = 0;
        updateBalanceDisplay();
        return;
    }
    
    try {
        const accounts = await currentWallet.getAccounts();
        const address = accounts[0].address;
        
        // Обновляем адрес в интерфейсе
        document.getElementById('walletAddress').textContent = address;
        document.getElementById('receiveAddress').textContent = address;
        
        // Получаем баланс из сети
        const response = await axios.get(
            `${NETWORK_CONFIG.rest}/cosmos/bank/v1beta1/balances/${address}`,
            { timeout: 10000 }
        );
        
        const balances = response.data.balances || [];
        const seiBalance = balances.find(b => b.denom === NETWORK_CONFIG.denom);
        currentBalance = seiBalance ? parseInt(seiBalance.amount) / Math.pow(10, NETWORK_CONFIG.decimals) : 0;
        
        console.log('Баланс получен:', currentBalance, 'SEI');
        updateBalanceDisplay();
        
        document.getElementById('availableBalance').textContent = currentBalance.toFixed(4);
        
    } catch (error) {
        console.error('Ошибка получения баланса:', error);
        
        if (error.response?.status === 404) {
            // Кошелек есть, но баланс 0
            currentBalance = 0;
            updateBalanceDisplay();
            document.getElementById('availableBalance').textContent = '0';
        } else {
            showNotification('Ошибка загрузки баланса', 'error');
        }
    }
}

function updateBalanceDisplay() {
    document.getElementById('balanceAmount').textContent = currentBalance.toFixed(4);
    
    if (seiPrice > 0 && currentBalance > 0) {
        const usdValue = (currentBalance * seiPrice).toFixed(2);
        document.getElementById('balanceUsd').textContent = `≈ $${usdValue}`;
    } else {
        document.getElementById('balanceUsd').textContent = '≈ $0.00';
    }
}

// ============================================
// ОТПРАВКА ТРАНЗАКЦИЙ
// ============================================

async function sendTransaction() {
    if (!currentWallet) {
        showNotification('Сначала подключите кошелек', 'error');
        return;
    }
    
    try {
        if (!isCosmJSLoaded) {
            throw new Error('Библиотеки CosmJS не загружены');
        }
        
        const toAddress = document.getElementById('sendToAddress').value.trim();
        const amount = parseFloat(document.getElementById('sendAmount').value);
        const feeOption = document.getElementById('feeOption').value;
        const memo = document.getElementById('sendMemo').value || '';
        
        // Валидация
        if (!toAddress.startsWith('sei')) {
            showNotification('Неверный адрес получателя', 'error');
            return;
        }
        
        if (!amount || amount <= 0) {
            showNotification('Введите корректную сумму', 'error');
            return;
        }
        
        if (amount > currentBalance) {
            showNotification('Недостаточно средств', 'error');
            return;
        }
        
        // Определяем комиссию
        const feeAmounts = {
            'low': 0.001,
            'medium': 0.002,
            'high': 0.005
        };
        
        const feeAmount = feeAmounts[feeOption] || 0.002;
        const totalNeeded = amount + feeAmount;
        
        if (totalNeeded > currentBalance) {
            showNotification(`Недостаточно средств с учетом комиссии`, 'error');
            return;
        }
        
        showNotification('Подготовка транзакции...', 'info');
        
        const accounts = await currentWallet.getAccounts();
        const fromAddress = accounts[0].address;
        
        // Конвертируем в usei
        const amountInUsei = Math.floor(amount * Math.pow(10, NETWORK_CONFIG.decimals));
        const feeInUsei = Math.floor(feeAmount * Math.pow(10, NETWORK_CONFIG.decimals));
        
        // Создаем клиент для отправки транзакций
        const client = await window.SigningStargateClient.connectWithSigner(
            NETWORK_CONFIG.rpc,
            currentWallet,
            {
                prefix: NETWORK_CONFIG.bech32Prefix
            }
        );
        
        // Создаем сообщение для отправки
        const sendMsg = {
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: {
                fromAddress: fromAddress,
                toAddress: toAddress,
                amount: [{
                    denom: NETWORK_CONFIG.denom,
                    amount: amountInUsei.toString()
                }]
            }
        };
        
        // Комиссия
        const fee = {
            amount: [{
                denom: NETWORK_CONFIG.denom,
                amount: feeInUsei.toString()
            }],
            gas: "200000"
        };
        
        showNotification('Подпись и отправка транзакции...', 'info');
        
        // Отправляем транзакцию
        const result = await client.signAndBroadcast(
            fromAddress,
            [sendMsg],
            fee,
            memo
        );
        
        console.log('Результат транзакции:', result);
        
        if (result.code === 0) {
            showNotification(`Транзакция успешно отправлена! Хэш: ${result.transactionHash.substring(0, 20)}...`, 'success');
            
            // Очищаем форму
            document.getElementById('sendToAddress').value = '';
            document.getElementById('sendAmount').value = '';
            document.getElementById('sendMemo').value = '';
            hideModal('sendModal');
            
            // Обновляем баланс через 5 секунд
            setTimeout(updateBalance, 5000);
            
        } else {
            showNotification(`Ошибка транзакции: ${result.rawLog || 'Неизвестная ошибка'}`, 'error');
        }
        
    } catch (error) {
        console.error('Ошибка отправки транзакции:', error);
        showNotification('Ошибка отправки транзакции: ' + error.message, 'error');
    }
}

// ============================================
// ИНТЕРФЕЙС И УТИЛИТЫ
// ============================================

function showBackupDataDirect(mnemonic, address) {
    // Заполняем данные в модальном окне
    const mnemonicDiv = document.getElementById('backupMnemonic');
    mnemonicDiv.innerHTML = '';
    
    mnemonic.split(' ').forEach((word, i) => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'mnemonic-word';
        wordDiv.innerHTML = `<span class="mnemonic-index">${i + 1}</span>${word}`;
        mnemonicDiv.appendChild(wordDiv);
    });
    
    document.getElementById('backupAddress').value = address;
    
    // Показываем модальное окно
    showModal('backupModal');
    
    // Также показываем всплывающее окно
    const popupHtml = `
        <div id="mnemonicPopup" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        ">
            <div style="
                background: #1e293b;
                padding: 30px;
                border-radius: 15px;
                max-width: 500px;
                width: 100%;
                border: 2px solid #ef4444;
                box-shadow: 0 0 40px rgba(239,68,68,0.3);
            ">
                <h2 style="color: #ef4444; margin-bottom: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle"></i> ВАЖНО! СОХРАНИТЕ ЭТУ ФРАЗУ!
                </h2>
                
                <p style="color: #cbd5e1; margin-bottom: 20px; text-align: center;">
                    Это единственный способ восстановить ваш кошелек!
                </p>
                
                <div style="
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin: 20px 0;
                ">
                    ${mnemonic.split(' ').map((word, i) => `
                        <div style="
                            background: #0f172a;
                            padding: 15px;
                            border-radius: 8px;
                            text-align: center;
                            border: 1px solid #334155;
                        ">
                            <div style="color: #94a3b8; font-size: 0.9em; margin-bottom: 5px;">${i + 1}</div>
                            <div style="font-weight: bold; font-size: 1.1em; color: #f1f5f9;">${word}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="
                    background: rgba(239,68,68,0.1);
                    border: 1px solid rgba(239,68,68,0.3);
                    border-radius: 8px;
                    padding: 15px;
                    margin: 20px 0;
                ">
                    <p style="color: #fca5a5; text-align: center;">
                        <strong>⚠️ ПРЕДУПРЕЖДЕНИЕ:</strong><br>
                        1. Запишите эти слова на бумаге<br>
                        2. Храните в безопасном месте<br>
                        3. Никогда не делитесь ими ни с кем!
                    </p>
                </div>
                
                <button onclick="closeMnemonicPopup()" style="
                    padding: 12px 30px;
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1em;
                    margin-top: 10px;
                    width: 100%;
                    font-weight: bold;
                ">
                    <i class="fas fa-check"></i> Я СОХРАНИЛ МНЕМОНИЧЕСКУЮ ФРАЗУ
                </button>
            </div>
        </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = popupHtml;
    document.body.appendChild(div);
}

function closeMnemonicPopup() {
    const popup = document.getElementById('mnemonicPopup');
    if (popup) {
        popup.remove();
    }
    showNotification('Не забудьте сохранить мнемоническую фразу в безопасном месте!', 'warning');
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const messageEl = document.getElementById('notificationMessage');
    
    if (!notification || !messageEl) return;
    
    messageEl.textContent = message;
    
    // Устанавливаем цвет в зависимости от типа
    if (type === 'success') {
        notification.style.borderLeftColor = '#10b981';
    } else if (type === 'error') {
        notification.style.borderLeftColor = '#ef4444';
    } else if (type === 'warning') {
        notification.style.borderLeftColor = '#f59e0b';
    } else {
        notification.style.borderLeftColor = '#3b82f6';
    }
    
    notification.style.display = 'flex';
    
    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function updateUI() {
    const isLoggedIn = !!currentWallet;
    
    document.getElementById('loginSection').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('walletControls').style.display = isLoggedIn ? 'block' : 'none';
    
    // Обновляем кнопки
    const buttons = ['sendBtn', 'refreshBtn', 'receiveBtn', 'backupBtn', 'logoutBtn'];
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = !isLoggedIn;
        }
    });
    
    // Обновляем адрес получателя
    if (isLoggedIn) {
        currentWallet.getAccounts().then(accounts => {
            if (accounts[0]) {
                document.getElementById('receiveAddress').textContent = accounts[0].address;
            }
        });
    }
}

function copyAddress() {
    if (!currentWallet) {
        showNotification('Кошелек не подключен', 'error');
        return;
    }
    
    currentWallet.getAccounts().then(accounts => {
        if (accounts[0]) {
            navigator.clipboard.writeText(accounts[0].address)
                .then(() => showNotification('Адрес скопирован!', 'success'))
                .catch(() => showNotification('Ошибка копирования', 'error'));
        }
    });
}

function copyReceiveAddress() {
    if (!currentWallet) return;
    
    currentWallet.getAccounts().then(accounts => {
        if (accounts[0]) {
            navigator.clipboard.writeText(accounts[0].address)
                .then(() => showNotification('Адрес для получения скопирован!', 'success'));
        }
    });
}

function setMaxAmount() {
    if (currentBalance > 0) {
        const fee = 0.002;
        const maxAmount = Math.max(0, currentBalance - fee);
        document.getElementById('sendAmount').value = maxAmount.toFixed(4);
        updateTransactionTotal();
    }
}

function updateTransactionTotal() {
    try {
        const amount = parseFloat(document.getElementById('sendAmount').value) || 0;
        const feeOption = document.getElementById('feeOption').value;
        
        const feeAmounts = {
            'low': 0.001,
            'medium': 0.002,
            'high': 0.005
        };
        
        const fee = feeAmounts[feeOption] || 0.002;
        const total = amount + fee;
        
        document.getElementById('feeAmount').textContent = fee.toFixed(3) + ' SEI';
        document.getElementById('totalAmount').textContent = total.toFixed(4) + ' SEI';
    } catch (error) {
        console.error('Ошибка обновления итога:', error);
    }
}

function showBackupData() {
    if (!currentWallet) {
        showNotification('Сначала подключите кошелек', 'error');
        return;
    }
    
    try {
        const walletDataStr = localStorage.getItem('sei_wallet');
        if (!walletDataStr) return;
        
        const data = JSON.parse(walletDataStr);
        
        if (!data.mnemonic) {
            showNotification('Мнемоническая фраза не найдена', 'error');
            return;
        }
        
        // Заполняем данные в модальном окне
        const mnemonicDiv = document.getElementById('backupMnemonic');
        mnemonicDiv.innerHTML = '';
        
        data.mnemonic.split(' ').forEach((word, i) => {
            const wordDiv = document.createElement('div');
            wordDiv.className = 'mnemonic-word';
            wordDiv.innerHTML = `<span class="mnemonic-index">${i + 1}</span>${word}`;
            mnemonicDiv.appendChild(wordDiv);
        });
        
        document.getElementById('backupAddress').value = data.address;
        
        showModal('backupModal');
        
    } catch (error) {
        console.error('Ошибка показа backup данных:', error);
        showNotification('Ошибка доступа к данным', 'error');
    }
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти? Ваш кошелек останется в браузере.')) {
        currentWallet = null;
        updateUI();
        showNotification('Вы вышли из кошелька', 'info');
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab[onclick*="${tabName}"]`)?.classList.add('active');
    document.getElementById(tabName + 'Tab')?.classList.add('active');
}

function saveWalletSettings() {
    const name = document.getElementById('walletName').value;
    const network = document.getElementById('networkSelect').value;
    
    if (name) {
        walletName = name;
        
        // Обновляем в localStorage
        const walletDataStr = localStorage.getItem('sei_wallet');
        if (walletDataStr) {
            const data = JSON.parse(walletDataStr);
            data.name = name;
            localStorage.setItem('sei_wallet', JSON.stringify(data));
        }
        
        showNotification('Настройки сохранены', 'success');
    }
}

function setupEventListeners() {
    // Закрытие модальных окон по клику на фон
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideModal(this.id);
            }
        });
    });
    
    // Закрытие по ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                hideModal(modal.id);
            });
        }
    });
    
    // Обновление суммы транзакции
    document.getElementById('sendAmount')?.addEventListener('input', updateTransactionTotal);
    document.getElementById('feeOption')?.addEventListener('change', updateTransactionTotal);
}

// ============================================
// ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ
// ============================================

window.createNewWallet = createNewWallet;
window.importWallet = importWallet;
window.sendTransaction = sendTransaction;
window.updateBalance = updateBalance;
window.logout = logout;
window.copyAddress = copyAddress;
window.copyReceiveAddress = copyReceiveAddress;
window.showModal = showModal;
window.hideModal = hideModal;
window.showBackupData = showBackupData;
window.checkNetworkStatus = checkNetworkStatus;
window.closeMnemonicPopup = closeMnemonicPopup;
window.setMaxAmount = setMaxAmount;
window.switchTab = switchTab;
window.saveWalletSettings = saveWalletSettings;
window.updateTransactionTotal = updateTransactionTotal;

console.log('SEI Кошелек (VPN версия) успешно загружен!');

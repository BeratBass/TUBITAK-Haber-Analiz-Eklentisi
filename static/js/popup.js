// popup.js
document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup yüklendi.");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const authContainer = document.getElementById("auth-container");
    const appContainer = document.getElementById("app-container");
    const notification = document.getElementById("notification");
    const blockNegativeContentCheckbox = document.getElementById("block-negative-content");
    const toggleSwitch = document.querySelector(".toggle-switch");
    const toggleLabel = document.querySelector(".toggle-label");

    // Bildirim gösterme fonksiyonu
    function showNotification(message, type = "success") {
        if (notification) {
            notification.textContent = message;
            notification.style.background = type === "success" ? "#38a169" : type === "error" ? "#e53e3e" : "#f6ad55";
            notification.style.display = "block";
            setTimeout(() => {
                notification.style.display = "none";
            }, 3000);
        }
    }

    // Oturum kontrolü
    function checkAuth() {
        chrome.storage.local.get(["userId", "isAdmin", "loginTime"], (data) => {
            if (data.userId && data.loginTime && (Date.now() - data.loginTime < 24 * 60 * 60 * 1000)) {
                console.log("Kullanıcı giriş yapmış:", data.userId);
                authContainer.style.display = "none";
                appContainer.style.display = "block";
                const [isim, soyisim] = data.userId.split("_");
                const userNameElement = document.getElementById("user-name");
                if (userNameElement) userNameElement.textContent = `${isim} ${soyisim}`;
                switchTab("analiz");
                chrome.storage.local.get(["blockNegativeContent"], (storageData) => {
                    const blockNegativeContent = storageData.blockNegativeContent !== false;
                    if (blockNegativeContentCheckbox) {
                        blockNegativeContentCheckbox.checked = blockNegativeContent;
                        if (toggleSwitch) {
                            toggleSwitch.classList.toggle("active", blockNegativeContent);
                        }
                    }
                    loadAnalysis();
                });
            } else {
                console.log("Kullanıcı giriş yapmamış.");
                chrome.storage.local.remove(["userId", "isAdmin", "loginTime"], () => {
                    authContainer.style.display = "block";
                    appContainer.style.display = "none";
                    loginForm.style.display = "block";
                    registerForm.style.display = "none";
                });
            }
        });
    }

    // Tab geçiş fonksiyonu
    function switchTab(tabId) {
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
        const tabElement = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tabElement) tabElement.classList.add("active");
        const contentElement = document.getElementById(tabId);
        if (contentElement) contentElement.classList.add("active");

        if (tabId === "analiz") loadAnalysis();
        if (tabId === "profil") loadProfile();
    }

    // Analiz yükleme fonksiyonu
    async function loadAnalysis() {
        const newsTitle = document.getElementById("news-title");
        const result = document.getElementById("result");
        const loading = document.getElementById("loading");
        const errorMessage = document.getElementById("error-message");

        if (loading) loading.style.display = "block";
        if (result) result.style.display = "none";
        if (newsTitle) newsTitle.textContent = "Analiz yapılıyor...";
        if (errorMessage) errorMessage.style.display = "none";

        try {
            const userData = await new Promise((resolve) => chrome.storage.local.get(["userId"], resolve));
            if (!userData.userId) {
                throw new Error("Kullanıcı girişi gerekli!");
            }

            const cachedData = await new Promise((resolve) => {
                chrome.storage.local.get(["lastContent", "lastAnalysis"], resolve);
            });

            if (cachedData.lastContent && cachedData.lastAnalysis && cachedData.lastAnalysis.durum) {
                console.log("Önbellekten veri yükleniyor:", cachedData);
                if (loading) loading.style.display = "none";
                if (result) result.style.display = "block";
                if (newsTitle) {
                    newsTitle.textContent = cachedData.lastContent.title || "Başlık Bulunamadı (Önbellek)";
                }
                if (result) {
                    result.textContent = cachedData.lastAnalysis.durum === "Olumlu"
                        ? "Olumlu"
                        : `Olumsuz (${cachedData.lastAnalysis.derece}/10)`;
                    result.className = `result ${cachedData.lastAnalysis.durum === "Olumlu" ? "positive" : "negative"}`;
                }
                applyBlockIfNeeded(cachedData.lastAnalysis);
                return;
            }

            console.log("Sayfa verisi çekiliyor...");
            const pageData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Sayfa verisi alınamadı: Zaman aşımı")), 5000);
                chrome.runtime.sendMessage({ action: "getNewsData" }, (data) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (data.error) {
                        reject(new Error(data.error));
                    } else {
                        resolve(data);
                    }
                });
            });

            if (!pageData.content || pageData.content === "Metin bulunamadı") {
                throw new Error("Haber metni alınamadı");
            }

            console.log("Sayfa verisi alındı:", pageData);

            console.log("Analiz isteği gönderiliyor...");
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch("http://127.0.0.1:5000/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: pageData.content, user_id: userData.userId, title: pageData.title }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP hatası: ${res.status}`);
            const responseData = await res.json();
            console.log("Analiz sonucu alındı:", responseData);

            if (responseData.error) {
                throw new Error(responseData.error);
            }

            if (loading) loading.style.display = "none";
            if (result) result.style.display = "block";
            if (newsTitle) {
                newsTitle.textContent = responseData.baslik || pageData.title || "Başlık Bulunamadı";
            }
            if (result) {
                result.textContent = responseData.durum === "Olumlu"
                    ? "Olumlu"
                    : `Olumsuz (${responseData.derece}/10)`;
                result.className = `result ${responseData.durum === "Olumlu" ? "positive" : "negative"}`;
            }

            chrome.storage.local.set({
                lastContent: pageData,
                lastAnalysis: responseData
            }, () => console.log("Veriler önbelleğe kaydedildi"));

            applyBlockIfNeeded(responseData);
        } catch (error) {
            console.error("Analiz hatası:", error);
            if (loading) loading.style.display = "none";
            if (result) {
                result.style.display = "block";
                result.textContent = "Analiz hatası";
                result.className = "result negative";
            }
            if (newsTitle) newsTitle.textContent = "Başlık Bulunamadı";
            if (errorMessage) {
                errorMessage.textContent = error.message || "Analiz sırasında bir hata oluştu. Lütfen tekrar deneyin.";
                errorMessage.style.display = "block";
            }
            showNotification(error.message || "Analiz hatası", "error");
        }
    }

    // Engelleme mantığını uygulama fonksiyonu
    function applyBlockIfNeeded(analysis) {
        chrome.storage.local.get(["blockNegativeContent"], (data) => {
            if (data.blockNegativeContent !== false && analysis.durum === "Olumsuz" && analysis.derece >= 4) {
                console.log("Engelleme tetikleniyor...");
                chrome.runtime.sendMessage({ action: "applyBlock" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Engelleme mesajı hatası:", chrome.runtime.lastError.message);
                        showNotification("Engelleme uygulanamadı", "error");
                    } else {
                        console.log("Engelleme mesajı gönderildi:", response);
                    }
                });
            }
        });
    }

    // Profil yükleme fonksiyonu
    async function loadProfile(page = 1, itemsPerPage = 5) {
        const userData = await new Promise((resolve) => chrome.storage.local.get(["userId"], resolve));
        if (!userData.userId) {
            showNotification("Kullanıcı girişi gerekli!", "error");
            return;
        }

        const tableBody = document.querySelector("#gecmis-analizler tbody");
        const pagination = document.getElementById("profile-pagination");
        const toplamAnaliz = document.getElementById("toplam-analiz");
        const olumluAnaliz = document.getElementById("olumlu-analiz");
        const olumsuzAnaliz = document.getElementById("olumsuz-analiz");

        try {
            const res = await fetch("http://127.0.0.1:5000/gecmis-analizler", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userData.userId, filter_type: "all" })
            });

            if (!res.ok) throw new Error(`HTTP hatası: ${res.status}`);
            const data = await res.json();

            if (tableBody) tableBody.innerHTML = "";
            if (pagination) pagination.innerHTML = "";

            // Sort analyses by date (newest first)
            const sortedAnalizler = data.analizler.sort((a, b) => 
                new Date(b.tarih) - new Date(a.tarih)
            );

            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const paginatedAnalizler = sortedAnalizler.slice(start, end);

            paginatedAnalizler.forEach((analiz) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${analiz.baslik || "Başlık Yok"}</td>
                    <td class="${analiz.durum === "Olumlu" ? "positive" : "negative"}">
                        ${analiz.durum}${analiz.derece > 0 ? ` (${analiz.derece}/10)` : ""}
                    </td>
                    <td>${analiz.tarih || "Tarih Yok"}</td>
                `;
                if (tableBody) tableBody.appendChild(row);
            });

            if (sortedAnalizler.length === 0) {
                if (tableBody) {
                    tableBody.innerHTML = `<tr><td colspan="3">Geçmiş analiz bulunamadı.</td></tr>`;
                }
            }

            const totalPages = Math.ceil(sortedAnalizler.length / itemsPerPage);
            for (let i = 1; i <= totalPages; i++) {
                const button = document.createElement("button");
                button.textContent = i;
                button.disabled = i === page;
                button.addEventListener("click", () => loadProfile(i, itemsPerPage));
                if (pagination) pagination.appendChild(button);
            }

            if (toplamAnaliz) toplamAnaliz.textContent = data.istatistikler.toplam_analiz || 0;
            if (olumluAnaliz) olumluAnaliz.textContent = data.istatistikler.olumlu_analiz || 0;
            if (olumsuzAnaliz) olumsuzAnaliz.textContent = data.istatistikler.olumsuz_analiz || 0;
        } catch (error) {
            console.error("Profil yükleme hatası:", error);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="3">Hata: ${error.message}</td></tr>`;
            }
            showNotification("Geçmiş analizler yüklenemedi", "error");
        }
    }

    // Giriş işlemi
    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) {
        loginBtn.addEventListener("click", async () => {
            const email = document.getElementById("login-email")?.value.trim();
            const password = document.getElementById("login-password")?.value.trim();
            const loginLoading = document.getElementById("login-loading");

            if (!email || !password) {
                showNotification("E-posta ve şifre gerekli!", "error");
                return;
            }

            if (loginLoading) loginLoading.style.display = "block";

            try {
                const res = await fetch("http://127.0.0.1:5000/check-auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (data.authenticated) {
                    chrome.storage.local.set({
                        userId: data.user_id,
                        isAdmin: data.is_admin,
                        loginTime: Date.now()
                    }, () => {
                        console.log("Giriş başarılı, kimlik bilgileri kaydedildi.");
                        checkAuth();
                        showNotification("Giriş başarılı!", "success");
                    });
                } else {
                    showNotification(data.error || "Giriş başarısız", "error");
                }
            } catch (error) {
                showNotification("Giriş hatası: " + error.message, "error");
            } finally {
                if (loginLoading) loginLoading.style.display = "none";
            }
        });
    }

    // Kayıt işlemi
    const registerBtn = document.getElementById("register-btn");
    if (registerBtn) {
        registerBtn.addEventListener("click", async () => {
            const isim = document.getElementById("register-isim")?.value.trim();
            const soyisim = document.getElementById("register-soyisim")?.value.trim();
            const email = document.getElementById("register-email")?.value.trim();
            const password = document.getElementById("register-password")?.value.trim();
            const yas = document.getElementById("register-yas")?.value.trim();
            const sehir = document.getElementById("register-sehir")?.value.trim();
            const registerLoading = document.getElementById("register-loading");

            if (!isim || !soyisim || !email || !password || !yas || !sehir) {
                showNotification("Tüm alanlar doldurulmalı!", "error");
                return;
            }

            if (registerLoading) registerLoading.style.display = "block";

            try {
                const res = await fetch("http://127.0.0.1:5000/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isim, soyisim, email, password, yas, sehir, is_admin: 0 })
                });

                const data = await res.json();

                if (res.ok) {
                    chrome.storage.local.set({
                        userId: data.user_id,
                        isAdmin: data.is_admin,
                        loginTime: Date.now()
                    }, () => {
                        console.log("Kayıt başarılı, kimlik bilgileri kaydedildi.");
                        checkAuth();
                        showNotification("Kayıt başarılı!", "success");
                    });
                } else {
                    showNotification(data.error || "Kayıt başarısız", "error");
                }
            } catch (error) {
                showNotification("Kayıt hatası: " + error.message, "error");
            } finally {
                if (registerLoading) registerLoading.style.display = "none";
            }
        });
    }

    // Çıkış işlemi
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            chrome.storage.local.remove(["userId", "isAdmin", "loginTime", "blockNegativeContent"], () => {
                console.log("Çıkış yapıldı, kimlik bilgileri silindi.");
                checkAuth();
                showNotification("Çıkış yapıldı!", "success");
            });
        });
    }

    // Profil düzenleme
    const editProfileBtn = document.getElementById("edit-profile-btn");
    const editProfileModal = document.getElementById("edit-profile-modal");
    const saveChangesBtn = document.getElementById("save-changes-btn");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");

    if (editProfileBtn) {
        editProfileBtn.addEventListener("click", () => {
            if (editProfileModal) editProfileModal.style.display = "block";
            chrome.storage.local.get(["userId"], (data) => {
                const [isim, soyisim, email, yas, sehir] = data.userId.split("_");
                document.getElementById("edit-isim").value = isim;
                document.getElementById("edit-soyisim").value = soyisim;
                document.getElementById("edit-email").value = email;
                document.getElementById("edit-yas").value = yas;
                document.getElementById("edit-sehir").value = sehir;
            });
        });
    }

    if (saveChangesBtn) {
        saveChangesBtn.addEventListener("click", async () => {
            const newIsim = document.getElementById("edit-isim")?.value.trim();
            const newSoyisim = document.getElementById("edit-soyisim")?.value.trim();
            const newEmail = document.getElementById("edit-email")?.value.trim();
            const newYas = document.getElementById("edit-yas")?.value.trim();
            const newSehir = document.getElementById("edit-sehir")?.value.trim();
            const currentPassword = document.getElementById("edit-current-password")?.value.trim();
            const newPassword = document.getElementById("edit-new-password")?.value.trim();

            if (!newIsim || !newSoyisim || !newEmail || !newYas || !newSehir || !currentPassword) {
                showNotification("Tüm zorunlu alanlar doldurulmalı!", "error");
                return;
            }

            try {
                const userData = await new Promise((resolve) => chrome.storage.local.get(["userId"], resolve));
                const updateData = {
                    user_id: userData.userId,
                    new_isim: newIsim,
                    new_soyisim: newSoyisim,
                    new_email: newEmail,
                    new_yas: newYas,
                    new_sehir: newSehir
                };

                const res = await fetch("http://127.0.0.1:5000/update-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updateData)
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || "Kullanıcı güncelleme başarısız");
                }

                if (newPassword) {
                    const passwordRes = await fetch("http://127.0.0.1:5000/update-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            user_id: userData.userId,
                            current_password: currentPassword,
                            new_password: newPassword
                        })
                    });

                    if (!passwordRes.ok) {
                        const errorData = await passwordRes.json();
                        throw new Error(errorData.error || "Şifre güncelleme başarısız");
                    }
                }

                const newUserId = `${newIsim}_${newSoyisim}_${newEmail}_${newYas}_${newSehir}`;
                chrome.storage.local.set({
                    userId: newUserId,
                    loginTime: Date.now()
                }, () => {
                    if (editProfileModal) editProfileModal.style.display = "none";
                    checkAuth();
                    showNotification("Profil güncellendi!", "success");
                });
            } catch (error) {
                showNotification(error.message || "Profil güncelleme hatası", "error");
            }
        });
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", () => {
            if (editProfileModal) editProfileModal.style.display = "none";
        });
    }

    // Tüm analizleri silme
    const deleteAllBtn = document.getElementById("delete-all-btn");
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", async () => {
            if (!confirm("Tüm analizler silinecek, emin misiniz?")) return;

            const userData = await new Promise((resolve) => chrome.storage.local.get(["userId"], resolve));
            try {
                const res = await fetch("http://127.0.0.1:5000/delete-all", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userData.userId })
                });

                if (!res.ok) throw new Error("Silme işlemi başarısız");
                showNotification("Tüm analizler silindi!", "success");
                loadProfile();
            } catch (error) {
                showNotification("Silme hatası: " + error.message, "error");
            }
        });
    }

    // Şifre görünürlüğünü değiştirme
    const toggleLoginPassword = document.getElementById("toggle-login-password");
    const toggleRegisterPassword = document.getElementById("toggle-register-password");

    if (toggleLoginPassword) {
        toggleLoginPassword.addEventListener("click", () => {
            const loginPassword = document.getElementById("login-password");
            if (loginPassword.type === "password") {
                loginPassword.type = "text";
                toggleLoginPassword.textContent = "🙈";
            } else {
                loginPassword.type = "password";
                toggleLoginPassword.textContent = "👁️";
            }
        });
    }

    if (toggleRegisterPassword) {
        toggleRegisterPassword.addEventListener("click", () => {
            const registerPassword = document.getElementById("register-password");
            if (registerPassword.type === "password") {
                registerPassword.type = "text";
                toggleRegisterPassword.textContent = "🙈";
            } else {
                registerPassword.type = "password";
                toggleRegisterPassword.textContent = "👁️";
            }
        });
    }

    // Kayıt/Giriş formu geçişi
    const showRegisterLink = document.getElementById("show-register-link");
    const showLoginLink = document.getElementById("show-login-link");

    if (showRegisterLink) {
        showRegisterLink.addEventListener("click", (e) => {
            e.preventDefault();
            loginForm.style.display = "none";
            registerForm.style.display = "block";
        });
    }

    if (showLoginLink) {
        showLoginLink.addEventListener("click", (e) => {
            e.preventDefault();
            registerForm.style.display = "none";
            loginForm.style.display = "block";
        });
    }

    // Olumsuz içerik engelleme butonu
    function toggleBlockNegativeContent() {
        const isChecked = !blockNegativeContentCheckbox.checked;
        blockNegativeContentCheckbox.checked = isChecked;
        chrome.storage.local.set({ blockNegativeContent: isChecked }, () => {
            console.log("Olumsuz içerik engelleme durumu güncellendi:", isChecked);
            if (toggleSwitch) {
                toggleSwitch.classList.toggle("active", isChecked);
            }
            chrome.runtime.sendMessage({ action: "reanalyzePage" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Yeniden analiz mesajı hatası:", chrome.runtime.lastError.message);
                    showNotification("Sayfa yeniden analiz edilemedi", "error");
                } else {
                    console.log("Sayfa yeniden analiz edildi:", response);
                    loadAnalysis();
                }
            });
        });
    }

    if (blockNegativeContentCheckbox) {
        blockNegativeContentCheckbox.addEventListener("change", toggleBlockNegativeContent);
    }
    if (toggleSwitch) {
        toggleSwitch.addEventListener("click", toggleBlockNegativeContent);
    }
    if (toggleLabel) {
        toggleLabel.addEventListener("click", toggleBlockNegativeContent);
    }

    // Tab geçiş olayları
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            switchTab(tab.getAttribute("data-tab"));
        });
    });

    // İlk yüklemede oturumu kontrol et
    checkAuth();
});
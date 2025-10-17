// background.js
console.log("Background script başlatıldı.");

// Desteklenen siteler için seçiciler
const selectors = [
    {
        domain: "hurriyet.com.tr",
        title: "h1.rhd-article-title, h1.news-detail-title, h1[itemprop='headline'], h1.title, .article-header h1, .haber-baslik, h1",
        content: ".rhd-article-content p, .news-content p, .article-content p, article p, .story-content p, .haber-icerik p, .news-detail p"
    },
    {
        domain: "milliyet.com.tr",
        title: "h1.news-detail-title, h1.news-detail-title.title-actived, h1[itemprop='headline']",
        content: "article p, .news-content p, .news-content__inf p, .news-content__body p, .article-body p, .news-detail p, .news-content h2, .news-content__inf h2"
    },
    {
        domain: "sabah.com.tr",
        title: "h1.article-title, h1[itemprop='headline'], h1.pageTitle",
        content: "div[itemprop='articleBody'] p, div.article-content p, .newsDetailText p"
    },
    {
        domain: "sozcu.com.tr",
        title: "h1.news-title, h1.content-title, h1[itemprop='headline'], h1, .article-title h1",
        content: ".news-content p, .article-body p, article p, .content-detail p"
    }
];

const supportedDomains = ["hurriyet.com.tr", "milliyet.com.tr", "sabah.com.tr", "sozcu.com.tr"];

// Mesaj dinleyici
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Mesaj alındı:", message.action);

    if (message.action === "openPopup") {
        chrome.action.openPopup();
        sendResponse({ status: "Popup açılıyor" });
        return true;
    }

    if (message.action === "getNewsData") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                console.error("Aktif sekme bulunamadı.");
                sendResponse({ error: "Aktif sekme bulunamadı." });
                return;
            }

            const tab = tabs[0];
            if (!supportedDomains.some(domain => tab.url.includes(domain))) {
                console.error("Desteklenmeyen site:", tab.url);
                sendResponse({ error: "Bu site desteklenmiyor", url: tab.url });
                return;
            }

            // Sekmenin yüklendiğinden emin ol
            chrome.tabs.get(tab.id, (tabInfo) => {
                if (chrome.runtime.lastError || !tabInfo || tabInfo.status !== "complete") {
                    console.error("Sekme yüklenmedi veya erişilemedi:", chrome.runtime.lastError?.message);
                    sendResponse({ error: "Sayfa henüz yüklenmedi, lütfen tekrar deneyin." });
                    return;
                }

                // Önbellekten veri almayı dene
                chrome.storage.local.get(['lastContent', 'lastAnalysis'], (data) => {
                    if (data.lastContent && data.lastContent.url === tab.url && data.lastAnalysis) {
                        console.log("Önbellekten veri gönderiliyor:", data.lastContent);
                        sendResponse({
                            title: data.lastContent.title,
                            content: data.lastContent.content,
                            url: data.lastContent.url,
                            analysis: data.lastAnalysis
                        });
                    } else {
                        // content.js'ye mesaj gönder
                        chrome.tabs.sendMessage(tab.id, { action: "extractContent" }, (contentData) => {
                            if (chrome.runtime.lastError) {
                                console.error("İçerik çıkarma hatası:", chrome.runtime.lastError.message);
                                sendResponse({ error: "İçerik alınamadı, lütfen sayfayı yenileyin." });
                                return;
                            }
                            if (contentData.error) {
                                sendResponse(contentData);
                                return;
                            }
                            chrome.storage.local.set({ lastContent: contentData }, () => {
                                console.log("İçerik önbelleğe kaydedildi:", contentData);
                            });
                            sendResponse(contentData);
                        });
                    }
                });
            });
        });
        return true; // Asenkron yanıt için
    }

    if (message.action === "analyzeContent") {
        chrome.storage.local.get(['userId', 'blockNegativeContent'], (data) => {
            const userId = data.userId;
            const blockNegativeContent = data.blockNegativeContent !== false;
            if (!userId) {
                console.error("Kullanıcı girişi gerekli");
                sendResponse({ error: "Kullanıcı girişi gerekli" });
                return;
            }

            const { title, content, url } = message.data;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            fetch('http://127.0.0.1:5000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content, user_id: userId, title: title }),
                signal: controller.signal
            })
                .then(res => {
                    clearTimeout(timeoutId);
                    if (!res.ok) throw new Error(`HTTP hatası: ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    data.blockNegativeContent = blockNegativeContent;
                    chrome.storage.local.set({ lastAnalysis: data }, () => {
                        console.log("Analiz sonucu önbelleğe kaydedildi:", data);
                    });
                    sendResponse(data);
                })
                .catch(error => {
                    console.error("Analiz hatası:", error);
                    sendResponse({ error: error.message });
                });
        });
        return true; // Asenkron yanıt için
    }

    if (message.action === "reanalyzePage" || message.action === "triggerAnalysis") {
        chrome.storage.local.get(['userId'], (data) => {
            if (!data.userId) {
                console.error("Yeniden analiz atlanıyor: Kullanıcı girişi gerekli");
                sendResponse({ error: "Kullanıcı girişi gerekli" });
                return;
            }
            chrome.storage.local.remove(['lastContent', 'lastAnalysis'], () => {
                console.log("Önbellek temizlendi, yeniden analiz başlatılıyor.");
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (!tabs[0]) {
                        sendResponse({ error: "Aktif sekme bulunamadı." });
                        return;
                    }
                    chrome.tabs.sendMessage(tabs[0].id, { action: "extractContent" }, (contentData) => {
                        if (chrome.runtime.lastError || contentData.error) {
                            console.error("İçerik çıkarma hatası:", chrome.runtime.lastError?.message || contentData.error);
                            sendResponse({ error: "İçerik alınamadı." });
                            return;
                        }
                        chrome.runtime.sendMessage({ action: "analyzeContent", data: contentData }, (response) => {
                            sendResponse(response);
                        });
                    });
                });
            });
        });
        return true;
    }

    if (message.action === "applyBlock") {
        chrome.storage.local.get(["lastAnalysis", "blockNegativeContent"], (data) => {
            if (!data.lastAnalysis || data.blockNegativeContent === false) {
                sendResponse({ status: "Engelleme uygulanmadı" });
                return;
            }
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    sendResponse({ error: "Aktif sekme bulunamadı." });
                    return;
                }
                chrome.tabs.sendMessage(tabs[0].id, { action: "applyBlock" }, (response) => {
                    sendResponse(response);
                });
            });
        });
        return true;
    }

    sendResponse({ error: "Bilinmeyen işlem: " + message.action });
    return true;
});
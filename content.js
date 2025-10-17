// content.js
console.log("Content script yüklendi.");

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

// Overlay oluşturma fonksiyonu
function createOverlay(message, buttons = []) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(255,255,255,0.9)';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.fontFamily = 'Arial, sans-serif';
    
    const messageElement = document.createElement('p');
    messageElement.style.fontSize = '24px';
    messageElement.style.color = '#333';
    messageElement.textContent = message;
    overlay.appendChild(messageElement);

    buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.text;
        btn.style.margin = '10px';
        btn.style.padding = '10px 20px';
        btn.style.backgroundColor = button.color;
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', button.onClick);
        overlay.appendChild(btn);
    });

    return overlay;
}

// Sayfadan içerik çıkarma fonksiyonu
function extractContent() {
    const url = window.location.href;
    const domain = new URL(url).hostname;
    const config = selectors.find(sel => domain.includes(sel.domain));

    if (!config) {
        console.error("Desteklenmeyen site:", domain);
        return { error: "Desteklenmeyen site", url };
    }

    let titleElement = null;
    const titleSelectors = config.title.split(", ");
    for (let selector of titleSelectors) {
        titleElement = document.querySelector(selector);
        if (titleElement) break;
    }
    const title = titleElement ? titleElement.innerText.trim().substring(0, 200) : "Başlık bulunamadı";

    const contentElements = document.querySelectorAll(config.content);
    const content = Array.from(contentElements)
        .map(el => {
            const isUnwanted = el.closest(
                '.medyanet-inline-adv, .FIOnDemandWrapper, .social-share, .taboolaAd, .trc_related_container, .news-fullwith-img, ' +
                '.ad-container, .ad-slot, .sponsored-content, .widget, .comment-section, .share-buttons'
            );
            const text = el.innerText.trim();
            if (!isUnwanted && text.length > 20) {
                return text;
            }
            return null;
        })
        .filter(text => text !== null)
        .join(" ").substring(0, 15000);

    if (!content || content === "") {
        console.error("İçerik bulunamadı:", url);
        return { error: "İçerik bulunamadı", url, title };
    }

    return { title, content, url };
}

// Sayfayı analiz etme fonksiyonu
function analyzePage() {
    const existingOverlay = document.querySelector('div[style*="z-index: 2147483647"]');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    chrome.storage.local.remove(["lastContent", "lastAnalysis"], () => {
        console.log("Önbellek temizlendi.");
        
        chrome.storage.local.get(['userId', 'blockNegativeContent'], (data) => {
            const userId = data.userId;
            const blockNegativeContent = data.blockNegativeContent !== false;
            
            if (!userId) {
                console.warn("Analiz atlanıyor: Kullanıcı girişi gerekli");
                const overlay = createOverlay(
                    "Analiz yapmak için lütfen giriş yapın.",
                    [
                        {
                            text: "Giriş Yap",
                            color: "#2b6cb0",
                            onClick: () => {
                                chrome.runtime.sendMessage({ action: "openPopup" });
                                overlay.remove();
                            }
                        },
                        {
                            text: "Kapat",
                            color: "#e53e3e",
                            onClick: () => overlay.remove()
                        }
                    ]
                );
                document.documentElement.appendChild(overlay);
                return;
            }

            const contentData = extractContent();
            if (contentData.error) {
                console.error("İçerik çıkarma hatası:", contentData.error);
                return;
            }

            chrome.storage.local.set({ lastContent: contentData }, () => {
                console.log("İçerik önbelleğe kaydedildi:", contentData);
            });

            chrome.runtime.sendMessage({ 
                action: "analyzeContent", 
                data: contentData 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Analiz mesajı hatası:", chrome.runtime.lastError.message);
                    return;
                }
                if (response.error) {
                    console.error("Analiz hatası:", response.error);
                    return;
                }

                chrome.storage.local.set({ lastAnalysis: response }, () => {
                    console.log("Analiz sonucu önbelleğe kaydedildi:", response);
                });

                if (blockNegativeContent) {
                    const { derece } = response;
                    if (derece >= 8) {
                        const overlay = createOverlay(
                            `Bu sayfa yüksek olumsuzluk puanı (${derece}/10) nedeniyle engellendi.`,
                            [
                                {
                                    text: "Devam Et",
                                    color: "#2b6cb0",
                                    onClick: () => overlay.remove()
                                },
                                {
                                    text: "Geri Dön",
                                    color: "#e53e3e",
                                    onClick: () => history.back()
                                }
                            ]
                        );
                        document.documentElement.appendChild(overlay);
                    } else if (derece >= 4) {
                        const overlay = createOverlay(
                            `Bu sayfa orta düzeyde olumsuzluk puanına (${derece}/10) sahip. Devam etmek ister misiniz?`,
                            [
                                {
                                    text: "Evet",
                                    color: "#2b6cb0",
                                    onClick: () => overlay.remove()
                                },
                                {
                                    text: "Hayır",
                                    color: "#e53e3e",
                                    onClick: () => history.back()
                                }
                            ]
                        );
                        document.documentElement.appendChild(overlay);
                    }
                }
            });
        });
    });
}

// Mesaj dinleyici
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("content.js: Mesaj alındı:", message.action);
    
    if (message.action === "extractContent") {
        const contentData = extractContent();
        sendResponse(contentData);
    } else if (message.action === "reanalyzePage" || message.action === "triggerAnalysis") {
        console.log("Yeniden analiz tetiklendi.");
        analyzePage();
        sendResponse({ status: "Analiz başlatıldı" });
    } else if (message.action === "applyBlock") {
        chrome.storage.local.get(["lastAnalysis", "blockNegativeContent"], (data) => {
            if (!data.lastAnalysis || data.blockNegativeContent === false) {
                console.log("Engelleme uygulanmadı: Analiz yok veya engelleme kapalı.");
                sendResponse({ status: "Engelleme uygulanmadı" });
                return;
            }

            const existingOverlay = document.querySelector('div[style*="z-index: 2147483647"]');
            if (existingOverlay) {
                existingOverlay.remove();
            }

            const { derece } = data.lastAnalysis;
            if (derece >= 8) {
                const overlay = createOverlay(
                    `Bu sayfa yüksek olumsuzluk puanı (${derece}/10) nedeniyle engellendi.`,
                    [
                        {
                            text: "Devam Et",
                            color: "#2b6cb0",
                            onClick: () => overlay.remove()
                        },
                        {
                            text: "Geri Dön",
                            color: "#e53e3e",
                            onClick: () => history.back()
                        }
                    ]
                );
                document.documentElement.appendChild(overlay);
                sendResponse({ status: "Yüksek olumsuzluk overlay'i gösterildi" });
            } else if (derece >= 4) {
                const overlay = createOverlay(
                    `Bu sayfa orta düzeyde olumsuzluk puanına (${derece}/10) sahip. Devam etmek ister misiniz?`,
                    [
                        {
                            text: "Evet",
                            color: "#2b6cb0",
                            onClick: () => overlay.remove()
                        },
                        {
                            text: "Hayır",
                            color: "#e53e3e",
                            onClick: () => history.back()
                        }
                    ]
                );
                document.documentElement.appendChild(overlay);
                sendResponse({ status: "Orta olumsuzluk overlay'i gösterildi" });
            } else {
                sendResponse({ status: "Engelleme gerekmedi" });
            }
        });
    } else {
        sendResponse({ error: "Bilinmeyen işlem: " + message.action });
    }
    return true; // Asenkron yanıt için
});

// Sayfa yüklenirken otomatik analiz
window.addEventListener('load', () => {
    console.log("Sayfa yüklendi, analiz başlatılıyor...");
    analyzePage();
});

// SPA'larda sayfa değişimlerini yakalamak için
let lastUrl = location.href;
new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log("URL değişti, analiz başlatılıyor:", currentUrl);
        analyzePage();
    }
}).observe(document, { subtree: true, childList: true });
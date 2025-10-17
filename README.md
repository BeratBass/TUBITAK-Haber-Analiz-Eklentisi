# 🧠 TÜBİTAK Haber Analiz Eklentisi

> Bu proje, **TÜBİTAK tarafından kabul edilmiş** bir araştırma projesidir.  
> Proje kapsamında geliştirilen yapay zeka modeli, Türkçe haber metinlerinde **duygu analizi (olumlu / olumsuz)** yaparak kullanıcıların bilinçli haber tüketimini desteklemektedir.

---

## 🎥 **Uygulama Tanıtım GIF'i**

<p align="center">
  <img src="./eklenti.gif" alt="Haber Analiz Eklentisi Demo" width="320"/>
  <br/>
  <em>Chrome eklentisinin çalışma örneği — haber analizi ve içerik engelleme süreci.</em>
</p>

---

## 📰 **Proje Özeti**

Bu sistem iki ana bileşenden oluşur:

1. **Flask Backend (Python)**  
   - Türkçe haber metinlerini alır.  
   - XGBoost tabanlı model ile analiz yapar.  
   - Sonuçları veritabanına kaydeder.  
   - Kullanıcı işlemleri (kayıt, giriş, şifre güncelleme vb.) ve admin paneli işlevlerini yönetir.

2. **Chrome Eklentisi (Frontend)**  
   - Hürriyet, Milliyet, Sabah ve Sözcü sitelerindeki haberleri otomatik olarak algılar.  
   - İçerikleri API’ye göndererek analiz sonucunu kullanıcıya sunar.  
   - Dilerse olumsuz içerikleri otomatik olarak engeller.

---

## ⚙️ **Proje Yapısı**

| Dosya / Klasör | Açıklama |
|----------------|-----------|
| `app.py` | Flask tabanlı API — kullanıcı yönetimi, analiz kayıtları ve tahmin işlemleri |
| `XGBoost-model-egitimi.py` | Model eğitimi için Python betiği (veri yolları gizlenmiştir) |
| `background.js` | Chrome eklentisinin arka plan servis işlevleri |
| `content.js` | Sayfadan haber başlığı ve metni çıkartan içerik betiği |
| `manifest.json` | Chrome eklentisinin yapılandırma dosyası |
| `popup.html` | Eklentinin kullanıcı arayüzü (giriş, analiz, profil ekranları) |
| `veriler.html` | Admin paneli arayüzü (kullanıcı ve analiz yönetimi) |

> ⚠️ **Gizlilik Uyarısı:**  
> `csv_dosyası` ve `json_dosyası` klasörleri, veri seti ve model dosyaları içerdiği için **proje dışına çıkarılmıştır**.  
> Bu klasörlerin **adı, içeriği ve yapısı gizlidir.**  
> Hiçbir şekilde paylaşılmamalı, çoğaltılmamalı veya üçüncü kişilerle paylaşılmamalıdır.

---

## 🔒 **Kullanım ve Erişim**

Bu proje yalnızca **TÜBİTAK değerlendirme süreci** ve **akademik inceleme** amacıyla paylaşılmıştır.  
Kodlar **görsel olarak incelenebilir**, ancak **hiçbir şekilde kullanılamaz, kopyalanamaz veya dağıtılamaz.**

> ❌ **KULLANILMASI, ÇOĞALTILMASI VEYA PAYLAŞILMASI YASAKTIR.**  
> Tüm haklar geliştiriciye ve TÜBİTAK’a aittir.

---

## 🧩 **Sistem Çalışma Şeması**

1. Eklenti, desteklenen haber sitesindeki başlık ve metni algılar.  
2. Flask API’ye gönderir.  
3. Model metni analiz eder ve sonucu döndürür.  
4. Kullanıcı popup arayüzünde sonucu görür veya içerik engellenir.

---

## 🧾 **Yasal Uyarı**

Bu proje **telif hakkı ile korunmaktadır.**  
Kaynak kodlar yalnızca akademik inceleme için görüntülenebilir.

> ⚠️ Kodlar **kullanılamaz, değiştirilemez, paylaşılamaz, satılamaz veya türevi projelerde kullanılamaz.**

Herhangi bir şekilde izinsiz kullanım, **Telif Hakkı İhlali (Fikir ve Sanat Eserleri Kanunu 5846)** kapsamında değerlendirilir.

---

## 🧑‍💻 **Geliştirici**

**Berat Baş**  
📍 TÜBİTAK Destekli Proje Geliştiricisi  
🔗 [LinkedIn](https://www.linkedin.com/in/berat-baş-6a91a3274) | [GitHub](https://github.com/BeratBass)


---

## 📜 **Lisans**

Bu proje, **TÜBİTAK ve proje geliştiricisine ait özel mülkiyettir.**  
Hiçbir açık kaynak lisansı altında **kullanıma sunulmamıştır.**

> © 2025 — Tüm Hakları Saklıdır  
> Bu proje yalnızca **inceleme** amacıyla paylaşılmıştır.

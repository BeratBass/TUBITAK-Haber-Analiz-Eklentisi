import os
import json
import pandas as pd
import re
import nltk
from nltk.corpus import stopwords
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
import joblib
from sklearn.metrics import accuracy_score, classification_report

# Türkçe stopwords'leri indir
nltk.download('stopwords')
turkish_stop_words = [word for word in stopwords.words('turkish') if len(word) > 2]

# JSON dosyalarını okuma fonksiyonu
def read_json_file(file_path, is_lines_format=False):
    haberler = []
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"{file_path} bulunamadı! Dosya yolunu kontrol et.")
    
    with open(file_path, "r", encoding="utf-8") as f:
        if is_lines_format:
            for line in f:
                try:
                    haber = json.loads(line.strip())
                    metin = haber.get("Body", "").strip()
                    durum = haber.get("Durum", None)
                    if metin and durum is not None:
                        durum_int = int(float(str(durum)))
                        if 0 <= durum_int <= 10:
                            haberler.append({"metin": metin, "durum": durum_int})
                except (ValueError, TypeError, json.JSONDecodeError):
                    pass
        else:
            veri = json.load(f)
            for haber in veri:
                metin = haber.get("Body", "").strip()
                durum = haber.get("Durum", None)
                if metin and durum is not None:
                    durum_int = int(float(str(durum)))
                    if 0 <= durum_int <= 10:
                        haberler.append({"metin": metin, "durum": durum_int})
    return haberler

# Dosyaları oku
total_data = read_json_file("json_dosyası/total.json", is_lines_format=True)
aanews_data = read_json_file("json_dosyası/TRNews.AANews.json", is_lines_format=False)

# Verileri birleştir
combined_data = total_data + aanews_data

# Pandas DataFrame'e çevir
df = pd.DataFrame(combined_data)
print(f"Toplam haber sayısı: {len(df)}")
print("Sınıf dağılımı:\n", df["durum"].value_counts())

# Metin temizleme fonksiyonu
def temizle(text):
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    words = [word for word in text.split() if word not in turkish_stop_words and len(word) > 2]
    return ' '.join(words)

df["metin"] = df["metin"].apply(temizle)

# Veriyi kaydet
os.makedirs("csv_dosyası", exist_ok=True)
df.to_csv("csv_dosyası/haberveriseti.csv", index=False, encoding="utf-8")
print("Veri CSV olarak kaydedildi: csv_dosyası/haberveriseti.csv")

# Eğitim ve test setlerine ayır
X = df["metin"]
y = df["durum"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Pipeline oluştur (class_weight='balanced' eklendi)
pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(stop_words=turkish_stop_words, max_features=10000, ngram_range=(1, 2))),
    ("svm", SVC(kernel='linear', class_weight='balanced'))
])

# Modeli eğit
pipeline.fit(X_train, y_train)

# Test et
y_pred = pipeline.predict(X_test)
print("Doğruluk:", accuracy_score(y_test, y_pred))
print("Rapor:\n", classification_report(y_test, y_pred, zero_division=0))

# Modeli kaydet
joblib.dump(pipeline, "csv_dosyası/en_iyi_model_svm.pkl")
print("Model kaydedildi: csv_dosyası/en_iyi_model_svm.pkl")
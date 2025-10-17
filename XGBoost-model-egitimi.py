import os
import json
import pandas as pd
import re
import nltk
from nltk.corpus import stopwords
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from xgboost import XGBClassifier
from sklearn.pipeline import Pipeline
import joblib
from sklearn.metrics import accuracy_score, classification_report
import numpy as np
from collections import Counter

nltk.download('stopwords')
turkish_stop_words = [word for word in stopwords.words('turkish') if len(word) > 2]

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

total_data = read_json_file("json_dosyası/total.json", is_lines_format=True)
aanews_data = read_json_file("json_dosyası/TRNews.AANews.json", is_lines_format=False)

combined_data = total_data + aanews_data

df = pd.DataFrame(combined_data)

df = df.dropna(subset=["metin", "durum"])
df = df[df["metin"].str.strip() != ""]
print(f"Toplam haber sayısı (temizlendikten sonra): {len(df)}")
print("Sınıf dağılımı:\n", df["durum"].value_counts())

def temizle(metin):
    metin = metin.lower()
    metin = re.sub(r'[^\w\s]', ' ', metin) 
    metin = re.sub(r'\d+', ' ', metin) 
    metin = re.sub(r'\s+', ' ', metin).strip()
    kelimeler = [kelime for kelime in metin.split() if kelime not in turkish_stop_words and len(kelime) > 2]
    return ' '.join(kelimeler)

print("Metinler temizleniyor...")
chunk_size = 10000
cleaned_metinler = []
for i in range(0, len(df), chunk_size):
    chunk = df["metin"][i:i + chunk_size].apply(temizle)
    cleaned_metinler.extend(chunk)
    print(f"{i + len(chunk)} / {len(df)} satır temizlendi.")
df["metin"] = cleaned_metinler

os.makedirs("csv_dosyası", exist_ok=True)
df.to_csv("csv_dosyası/haberveriseti.csv", index=False, encoding="utf-8")
print("Veri CSV olarak kaydedildi: csv_dosyası/haberveriseti.csv")

print("Sınıf dengesizliği ele alınıyor (oversampling)...")
class_counts = Counter(df["durum"])
target_count = 5000 
oversampled_data = []
for label in class_counts:
    class_data = df[df["durum"] == label]
    oversample_factor = target_count / class_counts[label]
    if oversample_factor < 1:  
        oversampled_data.append(class_data.sample(n=target_count, random_state=42))
    else:  
        oversampled_data.append(class_data.sample(frac=oversample_factor, replace=True, random_state=42))
df_oversampled = pd.concat(oversampled_data).sample(frac=1, random_state=42).reset_index(drop=True)
print(f"Oversampling sonrası sınıf dağılımı:\n", df_oversampled["durum"].value_counts())

X = df_oversampled["metin"]
y = df_oversampled["durum"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        stop_words=turkish_stop_words,
        max_features=3000,  
        ngram_range=(1, 1),  
        dtype=np.float32  
    )),
    ("xgb", XGBClassifier(
        objective='multi:softmax',
        num_class=11,
        eval_metric='mlogloss',
        random_state=42,
        tree_method='hist', 
        n_jobs=4,  
        n_estimators=100,  
        max_depth=5,  
        learning_rate=0.1  
    ))
])

print("Model eğitiliyor...")
pipeline.fit(X_train, y_train)
print("Eğitim tamamlandı.")


y_pred = pipeline.predict(X_test)
print("Doğruluk (test seti):", accuracy_score(y_test, y_pred))
print("Rapor:\n", classification_report(y_test, y_pred, zero_division=0))

# Modeli kaydet
joblib.dump(pipeline, "csv_dosyası/en_iyi_model_xgb.pkl")
print("Model kaydedildi: csv_dosyası/en_iyi_model_xgb.pkl")

# Performans analizini kaydet
with open("csv_dosyası/performans_raporu.txt", "w", encoding="utf-8") as f:
    f.write(f"Doğruluk (test seti): {accuracy_score(y_test, y_pred)}\n")
    f.write("Sınıflandırma Raporu:\n")
    f.write(classification_report(y_test, y_pred, zero_division=0))
print("Performans raporu kaydedildi: csv_dosyası/performans_raporu.txt")
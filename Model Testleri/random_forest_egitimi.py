import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier  # Random Forest sınıfı import edildi
from sklearn.metrics import classification_report, accuracy_score
from sklearn.pipeline import Pipeline
import joblib
import nltk
from nltk.corpus import stopwords
import re

# NLTK Türkçe stop words'ü indir ve yükle
nltk.download('stopwords')
turkish_stop_words = stopwords.words('turkish')

# Gereksiz stop words'ü temizleyelim (isteğe bağlı)
# Kısa kelimeleri hariç tutuyoruz, ancak burada 2 harfli kelimelerin anlamlı olabileceğini göz önünde bulundurmalıyız.
turkish_stop_words = [word for word in turkish_stop_words if len(word) > 2]

# 1. Veriyi Yükleme
veri = pd.read_csv('csv_dosyaları/hazir_veri.csv')

# Eksik değerleri kontrol etme ve kaldırma
print(veri.isnull().sum())  # Eksik değerleri kontrol et
veri = veri.dropna(subset=['metin', 'durum'])  # Eksik değerleri temizle

# Verinin doğru türde olduğunu kontrol etme
veri['metin'] = veri['metin'].astype(str).str.strip()  # Metin sütununu temizle ve string türüne çevir

# 2. Metin Ön İşleme
# - Küçük harfe dönüştürme
# - Özel karakterleri kaldırma
veri['metin'] = veri['metin'].apply(lambda x: re.sub(r'\W', ' ', x.lower()))  # Küçük harfe dönüştürme ve özel karakterleri temizleme

# 3. Özellikleri ve etiketleri ayırma
X = veri['metin']
y = veri['durum']

# 4. Veriyi Eğitim ve Test Setlerine Ayırma
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# 5. Pipeline ile Vektörizasyon ve Model Eğitimi
pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(stop_words=turkish_stop_words, max_features=10000, ngram_range=(1, 2))),
    ('rf', RandomForestClassifier(random_state=42))  # Random Forest modelini kullandık
])

# Parametre araması için grid
param_grid = {
    'tfidf__max_features': [5000, 10000, 15000],
    'tfidf__ngram_range': [(1, 1), (1, 2)],
    'rf__n_estimators': [100, 200, 300],  # Random Forest için ağaç sayısı
    'rf__max_depth': [10, 20, 30],  # Ağaçların derinliği
    'rf__min_samples_split': [2, 5, 10],  # Düğüm bölünmeleri için minimum örnek sayısı
    'rf__min_samples_leaf': [1, 2, 4]  # Yapraklar için minimum örnek sayısı
}

# 6. Modeli Grid Search ile Eğitme
grid_search = GridSearchCV(pipeline, param_grid, cv=5, scoring='f1_weighted', verbose=2, n_jobs=-1)
grid_search.fit(X_train, y_train)

# 7. Modeli Değerlendirme
y_pred = grid_search.best_estimator_.predict(X_test)

# Sonuçları yazdırma
print("En iyi parametreler:", grid_search.best_params_)
print("Doğruluk: ", accuracy_score(y_test, y_pred))
print(classification_report(y_test, y_pred))

# 8. Model ve Vektörizer'i Kaydetme
joblib.dump(grid_search.best_estimator_, 'csv_dosyaları/en_iyi_model_rf.pkl')

# 9. Modeli Yükleyip Test Etme (isteğe bağlı)
loaded_model = joblib.load('csv_dosyaları/en_iyi_model_rf.pkl')
y_pred_new = loaded_model.predict(X_test)
print("Yüklenen model ile doğruluk: ", accuracy_score(y_test, y_pred_new))

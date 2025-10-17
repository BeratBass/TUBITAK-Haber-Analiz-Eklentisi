# app.py

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import sqlite3
import joblib
import re
from datetime import datetime
import os
import logging
import bcrypt

# Flask uygulamasını başlatır ve CORS ayarlarını yapılandırır.
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Uygulama genelinde kullanılacak günlük kaydı (logging) yapılandırmasını ayarlar.
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Önceden eğitilmiş makine öğrenmesi modelini diskten yükler.
try:
    model = joblib.load("csv_dosyası/en_iyi_model_xgb.pkl")
    logger.info("Model başarıyla yüklendi: csv_dosyası/en_iyi_model_xgb.pkl")
except Exception as e:
    logger.error(f"Model yüklenemedi: {str(e)}")
    model = None

# Veritabanına yeni bir bağlantı oluşturur ve döndürür.
def get_db_connection():
    try:
        conn = sqlite3.connect('analizler.db', detect_types=sqlite3.PARSE_DECLTYPES)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        logger.error(f"Veritabanı bağlantısı açılamadı: {str(e)}")
        raise Exception("Veritabanına bağlanılamadı, lütfen sistem yöneticisiyle iletişime geçin.")

# Veritabanını başlatır, gerekli tabloları (users, analizler) oluşturur veya günceller.
def init_db():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      email TEXT UNIQUE,
                      isim TEXT,
                      soyisim TEXT,
                      yas INTEGER,
                      sehir TEXT,
                      password TEXT,
                      is_admin INTEGER DEFAULT 0)''')
        c.execute('''CREATE TABLE IF NOT EXISTS analizler
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_id TEXT,
                      baslik TEXT,
                      metin TEXT,
                      durum TEXT,
                      derece INTEGER,
                      tarih TEXT,
                      UNIQUE(user_id, baslik))''')
        
        try:
            c.execute("ALTER TABLE users ADD COLUMN password TEXT")
            logger.info("users tablosuna password sütunu eklendi.")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
            logger.info("users tablosuna is_admin sütunu eklendi.")
        except sqlite3.OperationalError:
            pass
        
        conn.commit()
        logger.info("Veritabanı başarıyla başlatıldı.")
    except Exception as e:
        logger.error(f"Veritabanı başlatılamadı: {str(e)}")
        raise Exception("Veritabanı başlatılamadı, lütfen sistem yöneticisiyle iletişime geçin.")
    finally:
        conn.close()

# Uygulama başlatıldığında veritabanının varlığını kontrol eder ve gerekirse başlatır.
if not os.path.exists('analizler.db'):
    init_db()
else:
    init_db() # Mevcut veritabanında tablo/sütun güncellemeleri için tekrar çağrılır.

# Girdi metnini küçük harfe çevirir, noktalama işaretlerini ve sayıları kaldırır.
def temizle_metin(metin):
    try:
        metin = metin.lower()
        metin = re.sub(r'[^\w\s]', ' ', metin)
        metin = re.sub(r'\d+', ' ', metin)
        metin = re.sub(r'\s+', ' ', metin).strip()
        return metin
    except Exception as e:
        logger.error(f"Metin temizlenirken hata: {str(e)}")
        raise Exception("Metin işlenirken bir hata oluştu.")

# Yeni bir kullanıcıyı veritabanına kaydeder.
@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email')
        isim = data.get('isim')
        soyisim = data.get('soyisim')
        yas = data.get('yas')
        sehir = data.get('sehir')
        password = data.get('password')
        is_admin = data.get('is_admin', 0)

        if not all([email, isim, soyisim, yas, sehir, password]):
            logger.warning("Kayıt için tüm alanlar doldurulmalı!")
            return jsonify({"error": "Lütfen tüm alanları doldurun!"}), 400

        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('INSERT INTO users (email, isim, soyisim, yas, sehir, password, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  (email, isim, soyisim, yas, sehir, hashed_password, is_admin))
        conn.commit()
        user_id = f"{isim}_{soyisim}_{email}_{yas}_{sehir}"
        logger.info(f"Kullanıcı kaydedildi: {user_id}, is_admin: {is_admin}")
        return jsonify({"message": "Kayıt başarılı!", "user_id": user_id, "is_admin": is_admin}), 200
    except sqlite3.IntegrityError:
        logger.warning(f"Bu e-posta zaten kayıtlı: {email}")
        return jsonify({"error": "Bu e-posta zaten kayıtlı! Lütfen başka bir e-posta kullanın."}), 400
    except Exception as e:
        logger.error(f"Kullanıcı kaydedilirken hata: {str(e)}")
        return jsonify({"error": "Kayıt işlemi sırasında bir hata oluştu, lütfen tekrar deneyin."}), 500
    finally:
        if 'conn' in locals():
            conn.close()

# Kullanıcının e-posta ve şifresini veritabanındaki kayıtlarla karşılaştırarak kimliğini doğrular.
@app.route('/check-auth', methods=['POST'])
def check_auth():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            logger.warning("E-posta veya şifre eksik")
            return jsonify({"authenticated": False, "error": "E-posta ve şifre gereklidir!"}), 400

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT isim, soyisim, email, yas, sehir, password, is_admin FROM users WHERE email = ?', (email,))
        user = c.fetchone()

        if user:
            isim, soyisim, email, yas, sehir, hashed_password, is_admin = user
            if bcrypt.checkpw(password.encode('utf-8'), hashed_password):
                user_id = f"{isim}_{soyisim}_{email}_{yas}_{sehir}"
                logger.info(f"Kimlik doğrulama başarılı: {user_id}")
                return jsonify({"authenticated": True, "user_id": user_id, "is_admin": is_admin}), 200
            else:
                logger.warning(f"Şifre yanlış: {email}")
                return jsonify({"authenticated": False, "error": "Şifre yanlış! Lütfen tekrar deneyin."}), 401
        else:
            logger.warning(f"E-posta bulunamadı: {email}")
            return jsonify({"authenticated": False, "error": "Bu e-posta adresiyle kayıtlı bir kullanıcı bulunamadı!"}), 404
    except Exception as e:
        logger.error(f"Kimlik doğrulama sırasında hata: {str(e)}")
        return jsonify({"authenticated": False, "error": "Kimlik doğrulama sırasında bir hata oluştu, lütfen tekrar deneyin."}), 500
    finally:
        if 'conn' in locals():
            conn.close()

# Kullanıcının mevcut şifresini doğruladıktan sonra yeni şifresini veritabanında günceller.
@app.route('/update-password', methods=['POST'])
def update_password():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        current_password = data.get('current_password')
        new_password = data.get('new_password')

        if not all([user_id, current_password, new_password]):
            logger.warning("Şifre güncellemesi için tüm alanlar doldurulmalı!")
            return jsonify({"error": "Lütfen tüm alanları doldurun!"}), 400

        conn = get_db_connection()
        c = conn.cursor()
        email = user_id.split('_')[2]
        c.execute('SELECT password FROM users WHERE email = ?', (email,))
        user = c.fetchone()

        if user and bcrypt.checkpw(current_password.encode('utf-8'), user['password']):
            hashed_new_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
            c.execute('UPDATE users SET password = ? WHERE email = ?', (hashed_new_password, email))
            conn.commit()
            logger.info(f"Şifre güncellendi: {user_id}")
            return jsonify({"message": "Şifre başarıyla güncellendi!"}), 200
        else:
            logger.warning(f"Geçerli şifre yanlış: {user_id}")
            return jsonify({"error": "Mevcut şifre yanlış! Lütfen doğru şifreyi girin."}), 401
    except Exception as e:
        logger.error(f"Şifre güncellenirken hata: {str(e)}")
        return jsonify({"error": "Şifre güncelleme sırasında bir hata oluştu, lütfen tekrar deneyin."}), 500
    finally:
        if 'conn' in locals():
            conn.close()

# Gelen metni temizler, model ile tahmin yapar ve sonucu veritabanına kaydeder.
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        metin = data.get('text', '').strip()
        user_id = data.get('user_id', 'anonymous')
        baslik = data.get('title', '').strip()
        logger.info(f"/predict çağrıldı - user_id: {user_id}, baslik: {baslik[:50]}..., metin: {metin[:50]}...")

        if not metin or metin == "Metin bulunamadı":
            logger.warning("Metin boş veya geçersiz!")
            return jsonify({"error": "Metin bulunamadı! Lütfen geçerli bir haber metni sağlayın."}), 400

        if not baslik:
            baslik = "Başlık bulunamadı (Otomatik)"

        if not model:
            logger.error("Model yüklenemedi!")
            return jsonify({"error": "Analiz modeli yüklenemedi! Lütfen sistem yöneticisiyle iletişime geçin."}), 500

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM analizler WHERE user_id = ? AND baslik = ?', (user_id, baslik))
        mevcut_analiz = c.fetchone()

        if mevcut_analiz:
            analiz = {
                "id": mevcut_analiz['id'],
                "user_id": mevcut_analiz['user_id'],
                "baslik": mevcut_analiz['baslik'],
                "metin": mevcut_analiz['metin'],
                "durum": mevcut_analiz['durum'],
                "derece": int(mevcut_analiz['derece']),
                "tarih": mevcut_analiz['tarih'],
                "error": None
            }
            logger.info(f"Mevcut analiz bulundu: {baslik}")
            conn.close()
            return jsonify(analiz), 200

        temiz_metin = temizle_metin(metin)
        tahmin = model.predict([temiz_metin])[0]
        durum = "Olumlu" if tahmin == 0 else "Olumsuz"
        derece = int(tahmin) if tahmin > 0 else 0

        tarih = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        try:
            c.execute('''INSERT INTO analizler (user_id, baslik, metin, durum, derece, tarih)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                     (user_id, baslik, metin, durum, derece, tarih))
            conn.commit()
            c.execute('SELECT id FROM analizler WHERE user_id = ? AND baslik = ?', (user_id, baslik))
            analiz_id = c.fetchone()['id']
            logger.info(f"Analiz kaydedildi - ID: {analiz_id}")
        except sqlite3.IntegrityError:
            logger.info(f"Bu başlık zaten analiz edilmiş: {baslik}")
            conn.close()
            return jsonify({"message": "Bu haber zaten analiz edilmiş."}), 200

        conn.close()

        analiz = {
            "id": analiz_id,
            "user_id": user_id,
            "baslik": baslik,
            "metin": metin,
            "durum": durum,
            "derece": derece,
            "tarih": tarih,
            "error": None
        }
        logger.info(f"Analiz tamamlandı: {durum} ({derece}/10)")
        return jsonify(analiz), 200
    except Exception as e:
        logger.error(f"Analiz sırasında hata: {str(e)}")
        return jsonify({"error": "Haber analizi yapılamadı, lütfen tekrar deneyin veya sistem yöneticisiyle iletişime geçin."}), 500

# Belirtilen kullanıcının veritabanında kayıtlı tüm analizlerini filtreleyerek döndürür.
@app.route('/gecmis-analizler', methods=['POST'])
def gecmis_analizler():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        filter_type = data.get('filter_type', 'all')

        if not user_id:
            logger.warning("Geçmiş analizler için kullanıcı kimliği gerekli")
            return jsonify({"error": "Kullanıcı kimliği gerekli! Lütfen giriş yapın."}), 400

        conn = get_db_connection()
        c = conn.cursor()
        
        query = 'SELECT * FROM analizler WHERE user_id = ?'
        params = [user_id]
        
        if filter_type == 'olumlu':
            query += ' AND durum = ?'
            params.append('Olumlu')
        elif filter_type == 'olumsuz':
            query += ' AND durum = ?'
            params.append('Olumsuz')
            
        c.execute(query, params)
        analizler = c.fetchall()

        analiz_list = [
            {
                "id": analiz['id'],
                "baslik": analiz['baslik'],
                "metin": analiz['metin'],
                "durum": analiz['durum'],
                "derece": int(analiz['derece']),
                "tarih": analiz['tarih']
            } for analiz in analizler
        ]

        istatistikler = {
            "toplam_analiz": len(analizler),
            "olumlu_analiz": sum(1 for a in analizler if a['durum'] == 'Olumlu'),
            "olumsuz_analiz": sum(1 for a in analizler if a['durum'] == 'Olumsuz')
        }

        logger.info(f"Geçmiş analizler alındı - user_id: {user_id}, toplam: {len(analiz_list)}")
        conn.close()
        return jsonify({"analizler": analiz_list, "istatistikler": istatistikler}), 200
    except Exception as e:
        logger.error(f"Geçmiş analizler alınırken hata: {str(e)}")
        return jsonify({"error": "Geçmiş analizler yüklenemedi, lütfen tekrar deneyin."}), 500

# Kullanıcının profil bilgilerini (isim, soyisim, e-posta vb.) veritabanında günceller.
@app.route('/update-user', methods=['POST'])
def update_user():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        new_isim = data.get('new_isim')
        new_soyisim = data.get('new_soyisim')
        new_email = data.get('new_email')
        new_yas = data.get('new_yas')
        new_sehir = data.get('new_sehir')

        if not all([user_id, new_isim, new_soyisim, new_email, new_yas, new_sehir]):
            logger.warning("Kullanıcı güncelleme için tüm alanlar doldurulmalı!")
            return jsonify({"error": "Lütfen tüm alanları doldurun!"}), 400

        conn = get_db_connection()
        c = conn.cursor()
        old_email = user_id.split('_')[2]
        c.execute('''UPDATE users 
                    SET isim = ?, soyisim = ?, email = ?, yas = ?, sehir = ? 
                    WHERE email = ?''',
                 (new_isim, new_soyisim, new_email, new_yas, new_sehir, old_email))
        
        if c.rowcount == 0:
            logger.warning(f"Kullanıcı bulunamadı: {user_id}")
            conn.close()
            return jsonify({"error": "Kullanıcı bulunamadı! Lütfen geçerli bir kullanıcı seçin."}), 404

        c.execute('UPDATE analizler SET user_id = ? WHERE user_id = ?',
                 (f"{new_isim}_{new_soyisim}_{new_email}_{new_yas}_{new_sehir}", user_id))
        conn.commit()
        logger.info(f"Kullanıcı güncellendi: {user_id} -> {new_isim}_{new_soyisim}_{new_email}_{new_yas}_{new_sehir}")
        conn.close()
        return jsonify({"message": "Kullanıcı bilgileri başarıyla güncellendi!"}), 200
    except sqlite3.IntegrityError:
        logger.warning(f"Bu e-posta zaten kayıtlı: {new_email}")
        return jsonify({"error": "Bu e-posta zaten kullanılıyor! Lütfen başka bir e-posta seçin."}), 400
    except Exception as e:
        logger.error(f"Kullanıcı güncellenirken hata: {str(e)}")
        return jsonify({"error": "Kullanıcı bilgileri güncellenemedi, lütfen tekrar deneyin."}), 500

# Belirtilen kullanıcıyı ve ona ait tüm analizleri veritabanından siler.
@app.route('/delete-user', methods=['POST'])
def delete_user():
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            logger.warning("Kullanıcı silme için kullanıcı kimliği gerekli")
            return jsonify({"error": "Kullanıcı kimliği gerekli! Lütfen geçerli bir kullanıcı seçin."}), 400

        conn = get_db_connection()
        c = conn.cursor()
        email = user_id.split('_')[2]
        c.execute('DELETE FROM users WHERE email = ?', (email,))
        
        if c.rowcount == 0:
            logger.warning(f"Kullanıcı bulunamadı: {user_id}")
            conn.close()
            return jsonify({"error": "Kullanıcı bulunamadı! Lütfen geçerli bir kullanıcı seçin."}), 404

        c.execute('DELETE FROM analizler WHERE user_id = ?', (user_id,))
        conn.commit()
        logger.info(f"Kullanıcı silindi: {user_id}")
        conn.close()
        return jsonify({"message": "Kullanıcı ve analizleri başarıyla silindi!"}), 200
    except Exception as e:
        logger.error(f"Kullanıcı silinirken hata: {str(e)}")
        return jsonify({"error": "Kullanıcı silinemedi, lütfen tekrar deneyin."}), 500

# Belirtilen kullanıcının veritabanındaki tüm analiz kayıtlarını siler.
@app.route('/delete-all', methods=['POST'])
def delete_all():
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            logger.warning("Tüm analizleri silmek için kullanıcı kimliği gerekli")
            return jsonify({"error": "Kullanıcı kimliği gerekli! Lütfen giriş yapın."}), 400

        conn = get_db_connection()
        c = conn.cursor()
        c.execute('DELETE FROM analizler WHERE user_id = ?', (user_id,))
        conn.commit()
        logger.info(f"Tüm analizler silindi: {user_id}")
        conn.close()
        return jsonify({"message": "Tüm analizler başarıyla silindi!"}), 200
    except Exception as e:
        logger.error(f"Tüm analizler silinirken hata: {str(e)}")
        return jsonify({"error": "Analizler silinemedi, lütfen tekrar deneyin."}), 500

# Veritabanındaki tüm kullanıcıları analiz sayılarıyla birlikte listeler (admin yetkisi gerektirir).
@app.route('/all-users', methods=['GET'])
def all_users():
    try:
        search = request.args.get('search', '')
        conn = get_db_connection()
        c = conn.cursor()
        query = '''SELECT isim, soyisim, email, yas, sehir, 
                         (SELECT COUNT(*) FROM analizler WHERE user_id = 
                          users.isim || '_' || users.soyisim || '_' || users.email || '_' || users.yas || '_' || users.sehir) as analiz_sayisi
                  FROM users WHERE email LIKE ? OR isim LIKE ? OR soyisim LIKE ?'''
        c.execute(query, (f'%{search}%', f'%{search}%', f'%{search}%'))
        users = c.fetchall()

        user_list = [
            {
                "isim": user['isim'],
                "soyisim": user['soyisim'],
                "email": user['email'],
                "yas": user['yas'],
                "sehir": user['sehir'],
                "analiz_sayisi": user['analiz_sayisi']
            } for user in users
        ]
        logger.info(f"Tüm kullanıcılar alındı, toplam: {len(user_list)}")
        conn.close()
        return jsonify(user_list), 200
    except Exception as e:
        logger.error(f"Kullanıcılar alınırken hata: {str(e)}")
        return jsonify({"error": "Kullanıcı listesi alınamadı, lütfen tekrar deneyin."}), 500

# Veritabanındaki en son yapılan analizin detaylarını döndürür (admin paneli için).
@app.route('/veriler-data', methods=['GET'])
def veriler_data():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('SELECT * FROM analizler ORDER BY tarih DESC LIMIT 1')
        son_analiz = c.fetchone()

        if not son_analiz:
            logger.warning("Kayıtlı analiz bulunamadı")
            return jsonify({"error": "Henüz analiz yapılmamış! Lütfen önce bir haber analizi yapın."}), 404

        analiz = {
            "baslik": son_analiz['baslik'],
            "metin": son_analiz['metin'],
            "durum": son_analiz['durum'],
            "derece": int(son_analiz['derece']),
            "tarih": son_analiz['tarih']
        }
        logger.info(f"Son analiz alındı: {analiz['baslik']}")
        conn.close()
        return jsonify(analiz), 200
    except Exception as e:
        logger.error(f"Veriler alınırken hata: {str(e)}")
        return jsonify({"error": "Son analiz alınamadı, lütfen tekrar deneyin."}), 500

# Web arayüzünün ana sayfasını (index.html) render eder.
@app.route('/')
def index():
    return render_template('index.html')

# Web arayüzünün veriler sayfasını (veriler.html - admin paneli) render eder.
@app.route('/veriler')
def veriler():
    return render_template('veriler.html')

# Statik dosyaları (CSS, JS, resimler vb.) 'static' klasöründen sunar.
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# Flask uygulamasını geliştirme modunda (debug=True) ve belirtilen portta çalıştırır.
if __name__ == '__main__':
    app.run(debug=True, port=5000)
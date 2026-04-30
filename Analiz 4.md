# İstatistiksel Yöntemler ve Yorum Sınırları

Bu sistemde yer alan kartlar ve veri etiketleri, eğitimcilerin hızlı karar alabilmesi için basitleştirilmiş isimlerle sunulmaktadır. Arka planda çalışan bilimsel istatistik metotlarının detayları ve pedagojik yorum sınırları aşağıda sayfa bazlı olarak açıklanmıştır.

### 1. Öğrenci Analizi
*(Not: Trend verilerinin oluşması için öğrencinin en az 3 sınava girmiş olması gerekir.)*

* **Güncel Performans (Orijinal Adı: Üstel Ağırlıklı Hareketli Ortalama - EWMA):** Öğrencinin son 3 sınavı baz alınarak hesaplanır. En güncel sınava en yüksek ağırlık (%50) verilirken, geçmiş sınavların etkisi giderek azaltılır. **Pedagojik Anlamı:** Öğrencinin geçmişteki tek bir kötü veya iyi sınavının ortalamayı yanıltmasını engeller, "şu anki" ivmesini ve momentumunu gösterir.
* **Genel Yön / Trend Güvenilirliği (Orijinal Adı: Determinasyon Katsayısı - R²):** Öğrencinin gelişim grafiğinin ne kadar tutarlı olduğunu (0 ile 1 arası bir değerle) ölçer. 
  * **Yorum Sınırı:** Az veriyle (ör. 3 sınav) yüksek tutarlılık beklemek bilimsel değildir. Bu yüzden sistem *Adaptif R²* eşiği kullanır. Sonuçlar "Dalgalı" veya "Zayıf Trend" uyarısı veriyorsa, öğrencinin net bir düşüş/çıkış trendinde olduğu söylenemez.
* **Sınav Başı Değişim (Orijinal Adı: Doğrusal Regresyon Eğimi):** Öğrencinin ilk sınavından son sınavına uzanan en iyi uyum doğrusunun (trendin) eğimidir. Her yeni sınavda ortalama kaç net artış/azalış beklendiğini gösterir.
* **Sürpriz Payı (Orijinal Adı: Kalıntıların Standart Hatası - RMSE):** Öğrencinin aldığı gerçek netlerin, sistemin beklediği trend çizgisinden ortalama ne kadar saptığını ölçer. Değer ne kadar düşükse öğrenci o kadar "istikrarlı ve öngörülebilir" ilerliyor demektir.
* **Sınıf İçi / Kurum İçi Konum (Orijinal Adı: Z-Skoru):** *(Sadece "Tek Sınav" filtresi seçiliyken görünür.)* Öğrencinin aldığı netin, grup ortalamasından "kaç standart sapma" uzakta olduğunu verir. Ham nete bakmaktan daha bilimseldir; çünkü zor bir sınavda net düşse bile Z-skoru artmışsa öğrenci gruba kıyasla aslında başarı göstermiş demektir.

---

### 2. Sınıf Analizi

* **Sınıf İçi Dağılım (Orijinal Adı: Örneklem Standart Sapması ve Değişim Katsayısı - CV):** Sınıftaki öğrencilerin netlerinin sınıf ortalaması etrafında ne kadar dağınık olduğunu ölçer. Standart sapmanın ortalamaya oranlanmasıyla sınıfın "Homojen" (birbirine yakın seviye) mi yoksa "Heterojen" (uçurumlar var) mi olduğu etiketi üretilir.
* **Sınav Başına Değişim & Trend Güvenilirliği (Regresyon Eğimi ve R²):** Sınıf ortalamasının sınavdan sınava genel eğilimini ve bu eğilimin tutarlılığını gösterir.
* **Şubeler Arası Etki Büyüklüğü (Orijinal Adı: Cohen's d):** *(Sadece Şube filtresi "Tümü" seçiliyken ve en az 2 şube varsa görünür.)* En başarılı şube ile en zayıf şube (veya diğer şubeler) arasındaki performans farkının istatistiksel olarak ne kadar "anlamlı" olduğunu ölçer. **Pedagojik Anlamı:** İki sınıfın ortalaması arasında 3 net fark olabilir, ancak sınıfların iç dağılımı çok genişse bu fark "İhmal edilebilir" çıkar. Sistem, bu farkın "Küçük, Orta veya Büyük" bir etki olup olmadığını bilimsel olarak etiketler. (Sağlıklı hesaplama için sınıfta en az 10 öğrenci şartı aranır).

---

### 3. Ders Analizi

* **Öğrenciler Arası Dağılım (Standart Sapma ve Değişim Katsayısı):** Sadece seçili derste (ör. Matematik) öğrencilerin arasındaki seviye farkının büyüklüğünü gösterir.
* **Şubeler Arası Etki Büyüklüğü (Cohen's d):** *(Sadece tüm şubeler listelenirken görünür.)* İlgili ders özelinde, en iyi sınıf ile diğer sınıflar arasındaki performans ayrışmasının büyüklük derecesidir.
* **Genel Eğilim (Ders Eğimi ve R²):** Zaman içinde ilgili dersin kurum veya sınıf genelindeki ortalamasının çıkışta mı yoksa düşüşte mi olduğunu test eder.

---

### 4. Sınav Analizi (Sınav Özeti)
*(Bir sınavın tekil genel özeti veya tüm sınavların harmanlanmış özeti incelenirken kullanılır)*

* **Ortalamadan Uzaklık (Örneklem Standart Sapması):** Sınava giren grubun ortalama etrafındaki yayılımıdır.
* **Medyan Net (Orijinal Adı: Ortanca - Median):** Sınav sonuçları küçükten büyüğe dizildiğinde tam ortadaki öğrencinin netidir. **Pedagojik Anlamı:** Aritmetik ortalama, 3-5 tane çok yüksek/düşük alan öğrenciden aşırı etkilenir. Medyan ise etkilenmez. Medyan, ortalamadan belirgin şekilde düşük veya yüksekse "Sınav grubunun geneli başarılı/başarısız ama birkaç öğrenci ortalamayı bozuyor" yorumu yapılabilir.
* **Çeyrekler Arası Aralık (Orijinal Adı: Interquartile Range - IQR):** En başarılı %25 (Q3) ve en zayıf %25 (Q1) uç değerler dışarıda bırakılarak, ortadaki "ana kitlenin (%50)" ne kadarlık bir net aralığına sıkıştığını hesaplar. 
  * **Yorum:** Sistem bu aralığı medyana bölerek "Homojen, Normal Dağılım, Seviye Farkı Var, Kritik Kopukluk (Uçurum)" etiketleri üretir. Öğrencilerin koptuğu veya dengeli olduğu sınavları tespit eder.

---

### 5. Risk Analizi
*(Bu sayfa tek bir etiket üretmez, farklı parametreleri harmanlayan bir karar destek sistemidir)*

* **Düşüş Trendi (Orijinal Adı: Z-Skoru ve EWMA Adaptasyonu):** Öğrencinin sadece son dönem ağırlıklı ortalaması (EWMA) hesaplanır ve bu değer, mevcut sınıf popülasyonunun Z-Skoru içine yerleştirilir. Sonuçlar sınıf genelinin -1.2 veya -2.0 standart sapma altındaysa "Orta/Yüksek Risk" olarak işaretlenir. (Sadece kendi neti değil, gruba göre düşüşü baz alınır).
* **Sıra Gerilemesi (Yüzdelik Dilim / Kurum Sırası Değişimi):** Sınav zorluğundan bağımsız olarak, öğrencinin kurum içindeki yüzdelik sıralamasının son iki sınavdaki gerileme payıdır.
* **Risk Güvenilirliği (Adaptif R² Filtresi):** Öğrencinin netleri sürekli zikzak çiziyorsa (R² düşükse) görünen ani bir sıralama/net düşüşü "gerçek bir tehlike" olarak değil, *Ortalamaya Dönüş (Regression to the mean)* gürültüsü olarak algılanır ve sistem tarafından uyarı şiddeti otomatik düşürülür. Öğrenci hakkında gereksiz panik oluşturulmasını engeller.
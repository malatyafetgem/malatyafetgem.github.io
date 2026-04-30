# Analiz Yöntemi ve Yorum Sınırları

Bu bölüm yalnızca ilk bakışta anlaşılması zor istatistiksel göstergeleri açıklar.  
Ortalama, katılım, derece, kurum/sınıf ortalaması, en iyi öğrenci gibi doğrudan anlaşılır kartlar burada ayrıca açıklanmaz.

---

## 1. Öğrenci Analizi

### Trend / Genel Yön
**Bilimsel adı:** Doğrusal regresyon eğimi + R²  
**Ne zaman görünür?** Öğrencinin seçili sınav türünde en az **3 sınavı** varsa.  
**Neden?** 2 sınav yalnızca iki nokta verir; gerçek eğilim için en az 3 sonuç gerekir.  
**Nasıl yorumlanır?** Eğim pozitifse yükseliş, negatifse düşüş eğilimi vardır. Ancak R² düşükse bu eğilim güvenilir değildir.

| R² | Anlamı |
|---:|---|
| 0,00–0,19 | Trend zayıf / sonuçlar dalgalı |
| 0,20–0,29 | Zayıf eğilim |
| 0,30–0,59 | Okunabilir eğilim |
| 0,60+ | Güçlü ve tutarlı eğilim |

---

### Sınav Başı Değişim
**Bilimsel adı:** Regresyon eğimi  
**Ne zaman görünür?** Trend hesabıyla birlikte, en az **3 sınav** varsa.  
**Nasıl yorumlanır?** Öğrencinin her yeni sınavda ortalama kaç net artma/azalma eğiliminde olduğunu gösterir.  
Örneğin **+3** yaklaşık her sınav 3 net artış, **-2** yaklaşık her sınav 2 net düşüş eğilimi demektir. R² düşükse bu değer temkinli yorumlanır.

---

### Güncel Performans
**Bilimsel adı:** Üstel Ağırlıklı Hareketli Ortalama (EWMA)  
**Ne zaman görünür?** En az **3 sınav** varsa.  
**Neden?** Son sınavlar öğrencinin güncel durumunu eski sınavlardan daha iyi gösterir.  
**Nasıl yorumlanır?** Son 3 sınav ağırlıklı hesaplanır; en güncel sınav daha fazla etkiler. Öğrencinin “şu anki ivmesini” gösterir, klasik ortalamadan farklıdır.

---

### Sürpriz Payı
**Bilimsel adı:** RMSE / regresyon kalıntılarının standart hatası  
**Ne zaman görünür?** Trend hesabıyla birlikte, en az **3 sınav** varsa.  
**Neden?** Trend çizgisi olsa bile öğrenci sonuçları bu çizgiden çok sapıyorsa tahmin güveni düşer.  
**Nasıl yorumlanır?**

| Değer | Anlamı |
|---:|---|
| 0–3,99 | Çok düşük dalgalanma |
| 4–7,99 | Düşük dalgalanma |
| 8–13,99 | Orta dalgalanma |
| 14+ | Yüksek dalgalanma; trend dikkatli okunmalı |

---

### Kutu Grafiği / Öğrencinin Konumu
**Bilimsel adı:** Box plot, medyan, çeyrekler, IQR  
**Ne zaman görünür?** Seçili sınav türünde en az **10 sınav** varsa; karşılaştırılan grupta en az **3 öğrenci değeri** varsa.  
**Neden?** Az sınavla dağılım grafiği yanıltıcı olabilir. 10 sınav şartı, öğrencinin konumunu daha oturmuş bir veriyle göstermeyi amaçlar.  
**Nasıl yorumlanır?** Kutu ortadaki %50’lik grubu, çizgi medyanı, uçlar normal yayılımı gösterir. Öğrencinin işareti kutunun üstündeyse gruba göre güçlü, altındaysa destek ihtiyacı olabilir.

---

## 2. Sınıf Analizi

### Sınıf İçi Dağılım / Homojenlik
**Bilimsel adı:** Standart sapma + Değişim Katsayısı (CV)  
**Ne zaman görünür?** Sınıfta yeterli öğrenci sonucu varsa. Hesap için en az 2 değer gerekir; yorum için daha fazla öğrenci daha güvenilirdir.  
**Neden?** Aynı ortalamaya sahip iki sınıftan biri dengeli, diğeri çok dağınık olabilir.  
**Nasıl yorumlanır?**

| CV | Anlamı |
|---:|---|
| 0–9,99 | Çok homojen |
| 10–19,99 | Homojen |
| 20–34,99 | Heterojen |
| 35+ | Çok heterojen |

---

### Sınıf Trend Analizi
**Bilimsel adı:** Regresyon eğimi + R²  
**Ne zaman görünür?** Seçili sınav türünde en az **3 sınav** varsa.  
**Neden?** Tek sınavlık artış veya düşüş gerçek sınıf eğilimi sayılmaz.  
**Nasıl yorumlanır?** Eğim sınıf ortalamasının sınavdan sınava yönünü, R² ise bu yönün güvenilirliğini gösterir.

---

### Şubeler Arası Etki Büyüklüğü
**Bilimsel adı:** Cohen’s d  
**Ne zaman görünür?** Şube filtresi **Tümü** iken, en az 2 şube ve şube başına yaklaşık **10 öğrenci değeri** varsa.  
**Neden?** Ortalama farkı tek başına yanıltıcıdır; Cohen’s d farkın gerçekten büyük olup olmadığını sınıf içi dağılıma göre değerlendirir.  
**Nasıl yorumlanır?**

| Cohen’s d | Anlamı |
|---:|---|
| 0,00–0,19 | İhmal edilebilir fark |
| 0,20–0,49 | Küçük fark |
| 0,50–0,79 | Orta fark |
| 0,80+ | Büyük fark |

---

### Sınıflar Arası Kutu Grafiği
**Bilimsel adı:** Çok gruplu box plot  
**Ne zaman görünür?** Seçili sınav türünde en az **10 sınav**, karşılaştırılan sınıflarda en az **3 öğrenci değeri** varsa.  
**Neden?** Sınıflar arası dağılım, birkaç sınava göre çizilirse sınav zorluğundan fazla etkilenebilir.  
**Nasıl yorumlanır?** Kutuların konumu sınıfların genel düzeyini, kutunun genişliği sınıf içi seviye farkını gösterir.

---

## 3. Ders Analizi

### Ders İçi Dağılım
**Bilimsel adı:** Standart sapma + CV  
**Ne zaman görünür?** Seçili derste yeterli öğrenci sonucu varsa.  
**Neden?** Ders ortalaması normal görünse bile öğrenciler arasında büyük seviye farkı olabilir.  
**Nasıl yorumlanır?** CV yükseldikçe seçili derste öğrenci seviyeleri daha fazla ayrışıyor demektir.

---

### Ders Trend Analizi
**Bilimsel adı:** Regresyon eğimi + R²  
**Ne zaman görünür?** Seçili derste en az **3 sınavlık** karşılaştırılabilir veri varsa.  
**Neden?** Ders sonuçları konu kapsamından etkilenir; tek sınavlık değişim trend sayılmaz.  
**Nasıl yorumlanır?** Pozitif eğim ders performansında yükseliş, negatif eğim düşüş eğilimi gösterir. R² düşükse bu eğilim zayıftır.

---

### Şubeler Arası Ders Etki Büyüklüğü
**Bilimsel adı:** Cohen’s d  
**Ne zaman görünür?** Şube filtresi **Tümü** iken, en az 2 şube ve yeterli öğrenci verisi varsa.  
**Neden?** Ders bazlı farklarda birkaç soru sonucu fazla etkileyebilir; bu yüzden farkın büyüklüğü dağılımla birlikte yorumlanır.  
**Nasıl yorumlanır?** 0,20 küçük, 0,50 orta, 0,80 ve üzeri büyük fark kabul edilir.

---

### Ders Kutu Grafiği
**Bilimsel adı:** Box plot  
**Ne zaman görünür?** Seçili sınav türünde en az **10 sınav**, grup başına en az **3 değer** varsa.  
**Neden?** Ders dağılımı sınav kapsamından çok etkilenir; az sınavla grafik yanıltıcı olabilir.  
**Nasıl yorumlanır?** Kutusu yukarıda olan şube derste daha güçlü; kutusu geniş olan şubede seviye farkı daha fazladır.

---

## 4. Sınav Analizi

### Ortalamadan Uzaklık
**Bilimsel adı:** Standart sapma  
**Ne zaman görünür?** Sınavda yeterli öğrenci sonucu varsa; sağlıklı yorum için en az **5 öğrenci** gerekir.  
**Neden?** Çok az öğrencide bir uç sonuç dağılımı bozabilir.  
**Nasıl yorumlanır?** Değer büyüdükçe öğrenciler ortalamadan daha fazla uzaklaşır; yani sınav grubu daha dağınıktır.

---

### Medyan Net
**Bilimsel adı:** Ortanca / Median  
**Ne zaman görünür?** Sınavda yeterli öğrenci sonucu varsa.  
**Neden?** Ortalama uç değerlerden etkilenir; medyan tipik öğrenciyi daha iyi gösterebilir.  
**Nasıl yorumlanır?** Medyan ortalamadan çok düşükse birkaç yüksek sonuç ortalamayı yükseltmiş olabilir; medyan yüksekse birkaç düşük sonuç ortalamayı aşağı çekmiş olabilir.

---

### Çeyrekler Arası Aralık
**Bilimsel adı:** IQR  
**Ne zaman görünür?** Sınavda yeterli öğrenci sonucu varsa.  
**Neden?** En uç %25’lik grupları dışarıda bırakarak ortadaki %50 öğrencinin yayılımını gösterir.  
**Nasıl yorumlanır?**

| IQR / Medyan | Anlamı |
|---:|---|
| 0,00–0,19 | Homojen |
| 0,20–0,29 | Normal yayılım |
| 0,30–0,39 | Seviye farkı var |
| 0,40+ | Kritik kopukluk |

---

### Sınav Kutu Grafiği
**Bilimsel adı:** Box plot  
**Ne zaman görünür?** Seçili sınav türünde en az **10 sınav** ve gruplarda en az **3 değer** varsa.  
**Neden?** Az sınavda kutu grafiği sınavın genel yapısını değil geçici dalgalanmayı gösterebilir.  
**Nasıl yorumlanır?** Kutular sınıfların ana öğrenci kitlesini, medyan çizgisi tipik düzeyi, uçlar ise sıra dışı sonuçları gösterir.

---

## 5. Risk Analizi

### Risk Puanı
**Bilimsel/pedagojik yapı:** Ağırlıklı risk puanlama rubriği  
**Ne zaman görünür?** Öğrencide risk sinyali oluştuğunda.  
**Neden?** Tek bir veriye değil; katılım, sıralama gerilemesi, Z-skoru ve ders bazlı düşüşlere birlikte bakılır.  
**Nasıl yorumlanır?**

| Puan | Anlamı |
|---:|---|
| 1–39 | Düşük risk |
| 40–69 | Orta risk |
| 70+ | Yüksek risk |

Risk puanı tanı değildir; öğrenciyi daha yakından inceleme uyarısıdır.

---

### Düşüş Trendi
**Bilimsel adı:** EWMA + Z-skoru  
**Ne zaman görünür?** Öğrencinin en az 2 sınavı ve karşılaştırma grubunda en az **3 geçerli değer** varsa.  
**Neden?** Ham net düşüşü sınav zorluğundan kaynaklanabilir; Z-skoru öğrenciyi sınıf/seviye dağılımı içinde değerlendirir.  
**Nasıl yorumlanır?**

| Z-skoru | Anlamı |
|---:|---|
| -0,70 civarı | Hafif düşüş sinyali |
| -1,20 ve altı | Belirgin düşüş |
| -2,00 ve altı | Ciddi düşüş |

---

### Ders Bazlı Düşüş
**Bilimsel adı:** Ders bazlı Z-skoru  
**Ne zaman görünür?** Belirli bir derste öğrencinin grup ortalamasının belirgin altında kaldığı durumlarda; ders grubunda en az **3 değer** varsa.  
**Neden?** Toplam net normal görünse bile öğrenci bir derste kopma yaşayabilir.  
**Nasıl yorumlanır?** Z ≤ -1,20 belirgin gerilik; Z ≤ -2,00 ciddi gerilik olarak okunur.

---

### Sıra Gerilemesi
**Bilimsel adı:** Yüzdelik dilim değişimi  
**Ne zaman görünür?** Öğrencinin son iki sınav sırası karşılaştırılabiliyorsa.  
**Neden?** 10 sıra düşmek, 20 kişilik ve 200 kişilik sınavda aynı anlama gelmez. Bu yüzden oran kullanılır.  
**Nasıl yorumlanır?** Yaklaşık **%8 ve üzeri** gerileme izlenir; **%15 ve üzeri** belirgin gerilemedir. Trend güvenilirliği düşükse risk şiddeti düşürülür.

---

### Risk Güvenilirliği
**Bilimsel adı:** Adaptif R² filtresi  
**Ne zaman kullanılır?** Risk sinyallerinin gerçekten tutarlı olup olmadığını kontrol etmek için.  
**Neden?** Az sınavlı öğrencide ani düşüşler yanıltıcı olabilir.  
**Nasıl yorumlanır?**

| Sınav sayısı | R² eşiği |
|---:|---:|
| 3–4 | 0,15 |
| 5–6 | 0,20 |
| 7–9 | 0,25 |
| 10+ | 0,30 |

R² eşik altında kalırsa sonuç dalgalı kabul edilir ve risk yorumu daha temkinli yapılır.

---

## Kısa Not

Bu kartlar tek başına kesin hüküm vermez.  
Amaç; öğretmene “nerede düşüş var, nerede dalgalanma var, hangi sınıf/şube/ders daha yakından incelenmeli?” sorularında bilimsel destek sağlamaktır.

# Spec Phase 2 (Ticket-02) và tiêu chí nghiệm thu

> **Một phần đã bị Ticket-03 thay thế** (thắng sớm khi đủ đèn, thời lượng Đêm, chi phí thắp, điểm, vùng an toàn luôn có, hết choáng về chase). Xem [CHANGELOG](../../CHANGELOG.md) và [spec-phase3.md](spec-phase3.md). Nội dung dưới đây giữ nguyên làm lịch sử.

Nguồn số liệu: `src/config.js` + `src/levels.js` (khớp `game.contract.json` v1.1). Mỗi tiêu chí có test tương ứng trong `tests/headless.test.js` (tên test ghi ở cột phải).

## Phần 3 — Tính năng mới

| # | Tính năng | Tiêu chí nghiệm thu (AC) | Test |
|---|---|---|---|
| F1 | **Số liệu chuẩn** | AC1 tốc độ 6 m/s, tăng tốc/dừng ≤ 0.1 s (ở đây tức thì). AC2 nhảy 7 m/s, trọng lực 20, chỉ nhảy khi chạm đất. AC3 nhặt ≤ 1.0 m XZ và chênh cao ≤ 1.5 m, sức chứa 10. AC4 thắp đèn 10, nạp nhiều lần, đèn gần nhất / id nhỏ, ≤ 2.0 m, chỉ đèn chưa sáng. AC5 Tỏa Sáng 3 đom đóm, 5 m, hồi 3 s, choáng 120 tick, đẩy 4 m trong 15 tick. AC6 bị đánh: −1 Lửa, rơi floor(carried/2) trên vành 1.5–2.5 m, TTL 480, bất tử 90, recoil 2 m / 60 tick. AC7 điểm +10/đom đóm nạp, +100/đèn, +5/lần trúng Tỏa Sáng, thắng +2×giây còn lại +50×Lửa. | `movement`, `pickup`, `deposit`, `win`, `shade hit`, `pulse`, `jump` |
| F2 | **Lướt** | AC1 14 m/s × 12 tick = 2.8 m. AC2 hồi 1.5 s tính từ lúc bắt đầu lướt; bấm khi chưa hồi bị bỏ qua. AC3 hướng = hướng di chuyển, đứng yên thì hướng mặt (+Z lúc đầu). AC4 lướt trên không giữ độ cao. AC5 không bất tử. AC6 sự kiện `dash`. | `dash`, `dash in the air` |
| F3 | **Rơi khỏi đảo** | AC1 Y < −10: đúng 1 lần, −1 Lửa, mất hết đom đóm, bỏ qua bất tử, sự kiện `player_hit{by:fall, lost}`. AC2 chờ 60 tick (không nhặt, không bị chạm) rồi hồi sinh ở điểm xuất phát, vận tốc 0, bất tử 90. AC3 hết Lửa thì thua ngay, không hồi sinh. | `fall` ×2 |
| F4 | **Bục nhảy** | AC1 Đêm 2: bắn Y 14 m/s, ngang 24 m/s về tâm đảo kia, đáp trong đảo đích, phím di chuyển không ghi đè. AC2 Đêm 3 bục (0,3,13): Y 12, ngang 8 hướng −Z, đáp lên tầng 2. | `Night 2 jump pad`, `Night 3: ramp…` |
| F5 | **Bản đồ** | AC1 Đêm 1 đèn/điểm sinh đúng toạ độ chuẩn. AC2 Đêm 2: hai đảo r 28 nối cầu x∈[26,44], z∈[−2,2], bước ra ngoài cầu thì rơi. AC3 Đêm 3: 3 tầng, vách đứng chặn, 2 dốc 30°/150° leo được, tháp chuông chặn. | `Night 1 map`, `Night 2 map`, `Night 2: bridge`, `Night 3: ramp` |
| F6 | **Gió Lạc** | AC1 chỉ Đêm 2–3; sinh ở tick 1200, 2400…, tối đa 2, id D1, D2. AC2 idle→chase khi mang ≥ 5 và cách ≤ 15 m; mất điều kiện về idle. AC3 chạm ≤ 1.2 m: cướp min(3, đang mang), flee 240 tick rồi biến mất cùng đồ; mỗi con cướp 1 lần; không mất Lửa; bất tử không cản. AC4 Tỏa Sáng trúng chase → flee không cướp; trúng flee đang mang đồ → thả hết (`drifter_drop`), biến mất sau 120 tick. | `Gió Lạc` ×2, `Tỏa Sáng` |
| F7 | **Bùa Gió** | AC1 nhặt như đom đóm, sự kiện `charm_picked`. AC2 hiệu lực 600 tick (nhặt lại làm mới), chạy 7.2 m/s, Lướt không hồi chiêu nhưng vẫn phải bấm lại, bấm khi đang lướt bị bỏ qua, vẫn 14 m/s × 12 tick. AC3 xuất hiện lại sau 2700 tick. AC4 vị trí: Đêm 2 (35,0,0); Đêm 3 (30,0,25), (−30,0,25). | `Bùa Gió` ×2 |
| F8 | **Gió mạnh (Đêm 3)** | AC1 mỗi 30 s một cơn gió 5 s, hướng ngẫu nhiên, đẩy 2 m/s (10 m cả cơn). AC2 báo trước 2 s (snapshot `wind`, UI: lá bay + âm thanh + chữ). AC3 `wind_enabled:false` thì không có gió. | `Night 3 wind` |
| F9 | **Tạm dừng** | AC1 `pause` false→true đảo trạng thái. AC2 khi paused, `tick` vẫn tăng nhưng `sim_tick`, thời gian, hồi chiêu, spawn, TTL đứng yên; snapshot `state:"paused"`. AC3 sự kiện `paused`/`resumed`. | `pause` |
| F10 | **Chuỗi 3 Đêm + UI** | AC1 Menu → giới thiệu Đêm (tên đảo + lời Ông Đăng) → chơi → kết quả → Đêm kế. AC2 thắng Đêm 3 → màn Bình Minh + tổng điểm (tổng điểm các Đêm đã thắng). AC3 thua → chơi lại đúng Đêm đó. AC4 Esc/P: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. AC5 Cài đặt âm lượng + độ nhạy chuột lưu trong localStorage. Kiểm chứng bằng chạy tay + ảnh chụp (xem `docs/proof/phase-2/`); không có test tự động cho UI. | thủ công |
| F11 | **Âm thanh** | AC1 nhạc nền đêm. AC2 hiệu ứng: nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối (+ bùa, cướp, rơi, gió). Tất cả tổng hợp bằng WebAudio, không file âm thanh. Chưa kiểm chứng bằng tai trong phiên làm việc này. | thủ công |
| F12 | **HUD** | Lửa (trên trái), đồng hồ mm:ss (giữa, đỏ + nhấp nháy ≤ 30 s), đèn k/n + điểm (phải), thanh 10 ô đom đóm, hồi chiêu Lướt / Tỏa Sáng, nhắc "E — Nạp ánh sáng (x/10)" khi gần đèn, mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình. Đã thấy trong ảnh chụp `docs/proof/phase-2/night*.png` (trừ nhắc E và đồng hồ đỏ, chưa chụp). | ảnh |
| F13 | **Bảng màu & ánh sáng** | Màu theo bảng chuẩn (hằng `C` trong `web/main.js`). Ánh sáng môi trường = 0.15 + 0.55 × (đèn sáng / tổng). Có thêm đèn hướng "ánh trăng" 0.8 để nhìn rõ hình khối (không thuộc bảng; ghi chú giả định). | ảnh |

## Bóng Mực — trạng thái (v1.1)

`spawning` (1 tick sau khi sinh, chưa tương tác) → `wander` (2 m/s, đổi hướng mỗi 120 tick) ⇄ `chase` (phát hiện ≤ 12 m, bỏ đuổi > 18 m) → `recoil` (sau khi gây hit) → `chase`; `stunned` sau Tỏa Sáng → `chase`.

## Giả định mới (chỗ ticket mơ hồ)

- Tăng tốc/dừng tức thì (thỏa "≤ 0.1 s").
- Khởi điểm Đêm 3 là (0,0,−20) vì tâm đảo là tháp chuông; scenario có thể đặt vị trí tùy ý (nếu `y` thấp hơn mặt đất tại đó thì được nâng lên mặt đất).
- Trần 30 đom đóm tính cả đom đóm rơi. "Điểm trống" = điểm sinh không có đom đóm loại random. Đêm 1 chỉ có 24 điểm nên không bao giờ vượt 24 đom đóm random.
- Đom đóm rơi của Gió Lạc (`drifter_drop`) cũng sống 480 tick; "biến mất sau 120 tick" hiểu là Gió Lạc rời đi sau 120 tick.
- Chênh cao cho va chạm Bóng Mực: giữa chân Mây và chân Bóng Mực (pos.y − 1.0).
- Mục tiêu Tỏa Sáng đo 3D từ tâm Tỏa Sáng tới tâm Bóng Mực (pos.y = mặt đất + 1.0); Gió Lạc bay ở độ cao mặt đất + 1.5.
- Điểm Tỏa Sáng chỉ tính cho Bóng Mực, không tính cho Gió Lạc.
- Tốc độ Bóng Mực đi lang thang 2 m/s; Gió Lạc idle chỉ lượn quanh đảo.
- Sự kiện `night_start` được ghi với `tick: 0` ngay sau snapshot 0.
- Khi đang pause, các nút khác bị bỏ qua; tick resume vẫn chạy bình thường.
- Snapshot `invuln` là boolean; dòng `end` ghi `playing` nếu kết thúc khi đang pause.
- Vách tầng: bước lên cao hơn 0.35 m thì bị chặn (trượt dọc vách).
- Tick bắt đầu lịch sinh (300, 1200, 240…) tính theo `sim_tick`, không phụ thuộc `time_left_s` của scenario.

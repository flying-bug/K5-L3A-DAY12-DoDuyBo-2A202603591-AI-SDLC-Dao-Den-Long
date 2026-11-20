# Changelog

## Phase 3 — "Đèn cạn dầu" (Contract v1.2) — BREAKING

### Breaking changes (hành vi cũ không còn đúng)

| # | Thay đổi | Trước (Phase 1–2) | Sau (Phase 3) |
|---|---|---|---|
| 1 | Luật thắng | Thắng ngay khi mọi đèn sáng (`all_lit`) | Không có thắng sớm. Thắng khi hết giờ nếu Mây còn sống và số đèn sáng ≥ ceil(0.6 × tổng) (`dawn_survived`) |
| 2 | Lý do kết thúc | `all_lit`, `dawn`, `no_flames` | `dawn_survived`, `dawn`, `no_flames` (`all_lit` không còn dùng) |
| 3 | Thời lượng Đêm | 300 / 330 / 360 s | 240 / 270 / 300 s |
| 4 | Đèn đã sáng | Không nhận thêm đom đóm, sáng mãi | Có `fuel` (100, hao 1/s), nhận thêm đom đóm để châm dầu, hết dầu thì tắt |
| 5 | Vùng an toàn | Đèn sáng luôn có vùng 6 m | Chỉ khi `fuel ≥ 30` |
| 6 | Chi phí thắp | 10 đom đóm | 10 lần đầu, 5 khi thắp lại (đèn từng sáng) |
| 7 | Sức chứa | Cố định 10 | 10 + 2 × số lần thắp thành công, tối đa 20 |
| 8 | Điểm | +10/đom đóm nạp, +100/đèn, +5/trúng Tỏa Sáng, +2×giây còn lại, +50×Lửa | +5/đom đóm nạp (cả châm dầu), +100 thắp đầu, +40 thắp lại, +5 (+15 nếu đang drain) trúng Tỏa Sáng, bình minh: +50+floor(fuel) mỗi đèn sáng, +50 mỗi Lửa. Bỏ thưởng thời gian |
| 9 | Hết choáng | Bóng Mực về `chase` | Về `wander` (rồi `chase` nếu Mây ≤ 12 m) |
| 10 | Bóng Mực `wander` | Đi lang thang ngẫu nhiên | Đi tới đèn yếu gần nhất, không có thì đèn tối gần nhất, rồi mới lang thang. Dùng tốc độ Bóng Mực |
| 11 | Tương tác đèn | Chỉ đèn chưa sáng | Đèn chưa sáng hoặc đang sáng nhưng chưa đầy dầu |

### Thêm mới

- Trạng thái Bóng Mực `drain`; sự kiện `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit.relight`.
- Snapshot: `lanterns[].fuel/ever_lit/relit_count`, `player.capacity`, `shades[].target_lantern_id` (khi drain).
- Scenario: `lanterns[].fuel/ever_lit/relit_count`, `player.successful_lights`, `shades[].target_lantern_id`, trạng thái `drain`.
- Giao diện: thanh dầu, nhấp nháy 1 Hz khi fuel < 30, đèn tắt xẹp 20% + vết rách, HUD "đang mang / sức chứa", "cần N đèn", cảnh báo đèn sắp hết dầu, cài đặt "Bảng màu dễ phân biệt".

### Test thay đổi

- **Xóa** (có lý do): `win: all lit -> score…` và `win on the exact tick time runs out…` — kiểm tra thắng sớm khi đủ đèn, luật này đã bị thay thế. Thay bằng các test dawn ở Phần C (`dawn: win needs ceil(0.6 x lanterns)…`, `no early win…`, `no_flames beats dawn…`, …).
- **Sửa số liệu**: `contract` (v1.2, thời lượng, khóa mới), `tick 0 snapshot` (240/270/300), `deposit` (+5/đom đóm, đèn đã sáng nhận châm dầu nên không còn "bị bỏ qua"), `shade states` (hết choáng → wander), `full Night 3 run` (đêm 3 dài 18.000 tick và dừng ở bình minh).
- Không có test nào bị `skip`.
- Thêm 22 test mới (Phần C) cho nhiên liệu, châm dầu, thắp lại, sức chứa, vùng an toàn theo fuel, drain, bình minh, scenario mới.

# Spec Phase 3 (Ticket-03) và tiêu chí nghiệm thu

Quyết định thiết kế: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Thay đổi phá vỡ: [CHANGELOG](../../CHANGELOG.md). Test nằm ở Phần C của `tests/headless.test.js`.

| # | Mục | Tiêu chí nghiệm thu | Test |
|---|---|---|---|
| 1.1 | Nhiên liệu | Vừa thắp = 100; hao 1.0/s theo tick (1/60); tính bằng số nguyên 1/60, không trôi số; xuất 1 chữ số thập phân; đèn tắt `fuel: 0`; `lit:true` không `fuel` → 100 | `fuel: starts at 100…`, `no float drift…` |
| 1.2 | Châm dầu | `used = min(mang, ceil((100−fuel)/10))`, `fuel = min(100, fuel+10×used)`, +5 điểm/đom đóm, sự kiện `refuel {lantern_id, amount, fuel}`; không phát `lantern_lit`. Chọn đèn nhận được gần nhất, bằng nhau lấy id nhỏ | `refuel…`, `interact picks…` |
| 1.3 | Hết dầu / thắp lại | `fuel ≤ 0` → tắt ngay sau bước 2, `deposited=0`, `lantern_out`, `ever_lit` giữ; thắp lại 5 đom đóm (+40, `relight:true`, `relit_count+1`); chưa từng sáng 10 (+100) | `lantern goes out…`, `relight…`, `a lantern that went out…` |
| 1.4 | Hiển thị | Thanh dầu trên đèn sáng; fuel < 30 nhấp nháy 1 Hz (đèn + thanh); đèn tắt xẹp 20% + vết rách | ảnh `docs/proof/phase-3/`; chưa có test tự động |
| 2.1 | Vùng an toàn | Chỉ khi `fuel ≥ 30` (đúng 30 vẫn còn) | `safe zone needs fuel >= 30` |
| 2.2 | Hút dầu | Chỉ `wander` chọn đèn: sáng yếu gần nhất (hòa → id nhỏ) → đèn tối gần nhất. ≤ 2 m thì `drain` (đứng yên, 5/s, cộng dồn, đèn vẫn hao 1/s). Sự kiện `fuel_drain {lantern_id, shade_id, fuel}` mỗi 60 tick | `wandering shade walks…`, `two draining shades stack…`, `wander without a weak lantern…` |
| 2.3 | Chuyển trạng thái | `drain`→`chase` (Mây ≤ 6 m), →`stunned` (Tỏa Sáng, +15 tổng), →`wander` (đèn tắt / fuel ≥ 30 / > 2 m). Hết choáng → `wander` | `drain: -> chase…`, `a plain Tỏa Sáng…` |
| 2.4 | Châm lên ≥ 30 | Bóng Mực trong 6 m bị đẩy ra mép ≤ 30 tick, không sát thương | `refuelling a weak lantern…` |
| 3.1 | Thắng bình minh | Không thắng sớm; hết giờ + còn sống + lit ≥ ceil(0.6N) (3/5, 4/6, 5/7) → `won/dawn_survived`; thiếu → `lost/dawn` | `no early win…`, `dawn: win needs…` |
| 3.2 | Thứ tự | Đếm đèn ở tick cuối (đèn cạn đúng tick cuối không tính); hết Lửa luôn thua `no_flames` trước, kể cả tick bình minh | `dawn counts the lanterns lit at the LAST tick…`, `no_flames beats dawn…` |
| 3.3 | Thời lượng | 240 / 270 / 300 s | `contract…`, `tick 0 snapshot…` |
| 4 | Sức chứa | `min(20, 10 + 2×successful_lights)`; thắp lại tính; đèn đặt bằng scenario không tính; HUD đang mang / sức chứa | `capacity = 10 + 2 x…` + ảnh |
| 5 | Điểm | +5/đom đóm nạp/châm; +100/+40; +5/+15 trúng Tỏa Sáng; bình minh +50+floor(fuel) mỗi đèn sáng, +50/Lửa; bỏ thưởng thời gian | `dawn: win needs…`, `score:…` |
| 6 | Mù màu | Cài đặt "Bảng màu dễ phân biệt" lưu trong localStorage; viền + mắt Bóng Mực `#00B3FF`; màu cảnh báo `#FFFFFF` + ⚠; phân biệt đèn tắt/sáng không cần màu | `docs/proof/phase-3/fuel-colorblind.png` (thủ công) |
| 7 | Contract v1.2 | `contract_version 1.2`; tuning khóa mới; snapshot/scenario/sự kiện mới; scenario sai kiểu → exit 2 | `contract…`, `new scenario fields are validated…` |

## Giả định mới

- Đèn "đầy đúng 100" không bao giờ tồn tại lúc bấm E vì hao dầu chạy trước tương tác (xem ADR). Mình giữ thứ tự ticket.
- Bóng Mực đi tới đèn bằng tốc độ Bóng Mực (4.0; Đêm 3: 4.5), không phải 2 m/s.
- `wander` mà không có đèn tối hay yếu nào: đi lang thang ngẫu nhiên như Phase 2.
- Đèn tối cũng bị nhắm làm điểm đến (tới ≤ 2 m rồi đứng chờ, không hút được vì không có dầu).
- `drain`→`chase` được kiểm tra trước các điều kiện về `wander`.
- `target_lantern_id` trong scenario dùng làm đèn bị hút cho Bóng Mực ở trạng thái `drain`; với `wander`, mục tiêu được tính lại mỗi tick.
- `fuel_drain` ghi sau 60 tick hút liên tục của từng Bóng Mực; `fuel` trong sự kiện là dầu sau khi bị hút.
- Giá trị `per_second_left` trong contract là 0 (bỏ thưởng thời gian); thêm các khóa `per_relight`, `per_stun_drain`, `per_lit_lantern_dawn`.
- Chọn đèn khi tương tác không còn "bỏ qua đèn đã sáng": đèn sáng chưa đầy vẫn là ứng viên và nếu gần hơn thì được chọn.

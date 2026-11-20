# ADR 0001 — Nhiên liệu đèn và thắng ở bình minh (Ticket-03, Contract v1.2)

Trạng thái: chấp nhận · Phase 3 · Thay thế các quyết định "đèn sáng là xong" và "thắng ngay khi đủ đèn" của Phase 1–2.

## Bối cảnh

Ticket-03 đổi mục tiêu từ "thắp hết đèn" sang "giữ đảo sáng tới bình minh". Mô hình trạng thái của đèn ở Phase 2 chỉ có hai giá trị (`lit` true/false) cộng `deposited`; luật thắng kiểm tra `every(lit)` sau mỗi tick và kết thúc ngay.

## Quyết định

### 1. Mô hình trạng thái đèn

Mỗi đèn có: `lit`, `deposited`, `fuel`, `ever_lit`, `relit_count`.

| Trạng thái | Điều kiện | Ghi chú |
|---|---|---|
| Tối, chưa từng sáng | `!lit && !ever_lit` | cần 10 đom đóm, nạp nhiều lần, nhớ tiến độ (`deposited`) |
| Sáng, khỏe | `lit && fuel >= 30` | có vùng an toàn 6 m |
| Sáng, yếu | `lit && fuel < 30` | mất vùng an toàn, bị Bóng Mực nhắm tới, nhấp nháy 1 Hz |
| Tối, đã từng sáng | `!lit && ever_lit` | chỉ cần 5 đom đóm để thắp lại |

Chuyển trạng thái: thắp (đủ đom đóm) → `fuel = 100`, `ever_lit = true`; `fuel <= 0` → tắt, `deposited = 0`, sự kiện `lantern_out`.

**Nhiên liệu là số nguyên theo đơn vị 1/60** (`fuel_units = fuel × 60`): hao 1 đơn vị/tick, bị hút 5 đơn vị/tick, mỗi đom đóm +600 đơn vị. Lý do: ticket yêu cầu không sai số thực; với số nguyên thì `ceil((100 − fuel)/10)` không bị lệch ở các mốc tròn (ví dụ 90.000000001). Chỉ làm tròn (1 chữ số thập phân) khi xuất snapshot/sự kiện.

### 2. Thứ tự trong tick

Giữ nguyên thứ tự Ticket-02, thêm `_fuelStep()` ngay sau bước 2 (counters): hao dầu → hút dầu → đèn `fuel <= 0` tắt. Hệ quả cần ghi nhớ: **hao dầu xảy ra trước tương tác (bước 5)**, nên đèn không bao giờ "đầy đúng 100" lúc bấm E (nó vừa mất 1/60). Nhánh "đèn đầy dầu không được chọn" (used = 0) vì vậy chỉ còn ý nghĩa phòng thủ; ngoài đời một đèn vừa châm đầy vẫn nhận thêm 1 đom đóm ở tick sau. Mình giữ nguyên theo ticket thay vì đổi thứ tự.

### 3. Luật thắng

Bỏ thắng sớm. Bước 11 (xét thắng/thua) theo thứ tự: hết Ngọn Lửa → thua `no_flames` (kể cả tick bình minh); hết giờ → đếm đèn `lit` ở tick cuối, `>= ceil(0.6 × tổng)` thì thắng `dawn_survived`, ngược lại thua `dawn`. Dùng `ceil(x − 1e-9)` để tránh lỗi float (0.6 × 5).

### 4. Bóng Mực

- Thêm trạng thái `drain`; `stunned` kết thúc về `wander` (trước đây về `chase`).
- Chỉ `wander` chọn đèn: đèn sáng yếu gần nhất → không có thì đèn tối gần nhất → không có thì đi lang thang ngẫu nhiên. Tới ≤ 2 m đèn yếu thì `drain` (đứng yên, hút 5/giây, cộng dồn).
- `drain` → `chase` nếu Mây ≤ 6 m (kiểm tra trước), → `wander` nếu đèn tắt / fuel ≥ 30 / cách đèn > 2 m.
- Đèn được châm lên ≥ 30 (từ dưới 30) đẩy Bóng Mực trong 6 m ra mép tối đa 30 tick, không gây sát thương (dùng lại cơ chế "vừa thắp").
- **Tốc độ khi đi tới đèn dùng tốc độ Bóng Mực (4.0 / 4.5 ở Đêm 3)**, không phải 2 m/s đi lang thang của Phase 2: ticket chỉ cho một tốc độ. 2 m/s chỉ còn dùng khi không có đèn nào để nhắm.

### 5. Sức chứa và điểm

Sức chứa = `min(20, 10 + 2 × successful_lights)`; `successful_lights` tăng ở mỗi lần thắp thành công (kể cả thắp lại), không tăng với đèn đặt bằng scenario. Điểm theo bảng Ticket-03 trong `src/config.js` (`score`); `per_second_left` = 0.

## Hệ quả

- Hợp đồng v1.2: snapshot thêm `fuel`, `ever_lit`, `relit_count`, `player.capacity`, trạng thái `drain`; sự kiện `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit.relight`; `game_over.reason` = `dawn_survived`.
- Đêm ngắn hơn (240/270/300 s). Chạy headless đủ một Đêm vẫn rất nhanh.
- Test của Phase 1–2 bị luật mới làm sai đã được sửa hoặc thay thế, xem [CHANGELOG](../../CHANGELOG.md).
- Giao diện: thanh dầu, nhấp nháy 1 Hz khi < 30, đèn tắt xẹp 20% + vết rách, bảng màu dễ phân biệt (lưu trong cài đặt).

## Phương án đã cân nhắc

- Lưu dầu dạng số thực: bị loại vì sai số tích lũy (ticket khuyến nghị số nguyên 1/60).
- Giữ thắng sớm kèm mục tiêu phụ: bị loại, ticket yêu cầu thay thế hẳn.

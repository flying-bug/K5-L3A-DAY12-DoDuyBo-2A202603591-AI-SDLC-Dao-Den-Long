# Đảo Đèn Lồng (Phase 3: đèn cạn dầu)

> Video demo: _(chưa có — sẽ đặt link Release `v1.0.0` ở đây)_

Game 3D góc nhìn thứ ba. Mây, người giữ đèn đội nón lá, gom đom đóm, thắp lại các Đèn Lồng Lớn trên 3 hòn đảo mang bối cảnh Việt Nam: **Làng quê Bắc Bộ** (đèn đình, cổng làng, tre, trâu), **Phố cổ Hội An** (đèn lồng lụa, cầu mái che, sông Hoài thả hoa đăng) và **Cố đô Huế** (thềm điện, tháp chùa, đèn cung đình). Bản đồ và luật giữ nguyên theo ticket, chỉ khác diện mạo, né Bóng Mực và Gió Lạc. Logic nằm trong một lõi JS tất định (`src/sim.js`, 60 tick/giây); bản 3D (three.js) và chế độ headless dùng chung lõi này.

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 18 (macOS/Linux/Windows).

```bash
npm install            # build_cmd
npm start              # run_cmd: mở http://localhost:8080
npm test               # 58 test chạy CLI headless thật
```

## Điều khiển

| Phím | Hành động |
|---|---|
| WASD / mũi tên | Di chuyển (theo hướng camera) |
| Space | Nhảy |
| Shift | Lướt (14 m/s, 0.2 s, hồi 1.5 s) |
| E | Nạp ánh sáng vào Đèn Lồng gần nhất (≤ 2 m) |
| F | Tỏa Sáng (tốn 3 đom đóm, hồi 3 s) |
| Kéo chuột / Q, R | Xoay camera |
| Esc / P | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |

Mẹo: `?night=2` trên URL vào thẳng Đêm 2; `?debug` hiện FPS.

## Luật chơi (Ticket-02 + Ticket-03 "Đèn cạn dầu")

- Nhặt đom đóm (≤ 1 m). Sức chứa = 10 + 2 × số lần thắp thành công, tối đa 20. Thắp đèn lần đầu cần 10 đom đóm (nạp nhiều lần được), thắp lại đèn đã từng sáng chỉ cần 5.
- **Đèn có dầu:** vừa thắp là 100, hao 1/giây. Bấm E ở đèn đang sáng để châm dầu (+10 mỗi đom đóm). Hết dầu đèn tắt. Dầu dưới 30 thì đèn nhấp nháy và mất vùng an toàn 6 m; Bóng Mực sẽ tới hút dầu (5/giây mỗi con). Tỏa Sáng làm chúng bỏ đèn.
- Đêm không còn kết thúc khi thắp đủ đèn: **giữ cho đủ đèn sáng tới bình minh** (Đêm 1 cần 3/5, Đêm 2 cần 4/6, Đêm 3 cần 5/7) mới thắng.
- Bóng Mực chạm: −1 🔥, rơi nửa số đom đóm đang mang, bất tử 1.5 s. Rơi khỏi đảo: −1 🔥, mất hết đom đóm, hồi sinh sau 1 s.
- Gió Lạc (Đêm 2–3) cướp tối đa 3 đom đóm nếu bạn mang ≥ 5. Tỏa Sáng làm nó bỏ chạy và thả đồ. Bùa Gió: chạy 7.2 m/s, Lướt không hồi chiêu trong 10 s.
- Đêm 2: hai đảo nối bằng cầu tre không lan can, bục nhảy bắn qua đảo kia. Đêm 3: ba tầng, dốc, bục nhảy lên đỉnh, gió mạnh mỗi 30 s (có báo trước).
- Thua khi hết 🔥 (kể cả đúng lúc bình minh) hoặc hết giờ mà số đèn sáng chưa đủ. Thời lượng 240 / 270 / 300 s. Thắng Đêm 3 thì tới màn Bình Minh.
- **Điểm:** +5 mỗi đom đóm nạp/châm, +100 thắp lần đầu, +40 thắp lại, +5 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu nó đang hút dầu). Bình minh (khi thắng): mỗi đèn đang sáng +50 + phần nguyên của dầu, mỗi 🔥 còn lại +50. Tổng điểm = tổng các Đêm đã thắng.

## Chế độ headless (Test Contract v1.2)

```bash
node src/headless.js --seed 1 --night 1|2|3 [--scenario s.json] [--inputs i.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
```

Thoát 0 bình thường, 2 nếu inputs/scenario/tham số sai, 1 với lỗi khác. Số liệu trong `game.contract.json` khớp `src/config.js` (có test). Chạy đủ một Đêm (21.600 tick) mất khoảng 0.3 s (có test `< 30 s`). Ví dụ: `docs/proof/phase-2/sample-drifter-*`.

Từ v1.2: snapshot có `fuel`, `ever_lit`, `relit_count`, `capacity`, trạng thái `drain`; sự kiện `refuel`, `lantern_out`, `fuel_drain`; kết thúc `dawn_survived`. `fall_enabled` là `true` (rơi khỏi đảo bị phạt). Không có khái niệm nào trong contract bị bỏ trống.

## Tài liệu

- Phase 3: [ADR 0001](docs/adr/0001-lantern-fuel-and-dawn-win.md) (quyết định thiết kế), [CHANGELOG.md](CHANGELOG.md) (thay đổi phá vỡ tương thích), [spec-phase3.md](docs/notes/spec-phase3.md) (tiêu chí nghiệm thu)
- Phase 2: [spec-phase2.md](docs/notes/spec-phase2.md) · Phase 1: [assumptions.md](docs/notes/assumptions.md)
- Nhật ký dùng AI, token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Harness AI: [AGENTS.md](AGENTS.md), `.claude/skills/verify-phase/`
- Đề lab gốc: `docs/lab-brief/`

## Sáng tạo của tôi

Chưa thêm tính năng ngoài ticket; ưu tiên số liệu chuẩn và Test Contract. Chi tiết nhỏ: nhân vật phụ Ông Đăng (lời giới thiệu mỗi Đêm), vầng sáng/vùng an toàn hiển thị quanh đèn sáng, Bóng Mực đổi màu khi bị choáng, nhạc nền và âm thanh tổng hợp bằng WebAudio (không file âm thanh, xem CREDITS).

## Bằng chứng Phase 3 (`docs/proof/phase-3/`)

- `npm-test.txt`: 58/58 test đạt (22 test mới cho Phase 3; test cũ bị luật mới làm sai đã sửa hoặc xóa có lý do, xem CHANGELOG; không có test nào bị skip).
- `fuel-normal.png`, `fuel-colorblind.png`: ảnh từ Chrome headless thật (thanh dầu, cảnh báo sắp hết dầu, sức chứa 7/16, "cần 3", bảng màu dễ phân biệt). Trong ảnh mình ép trạng thái đèn bằng lệnh kiểm tra; game thật chỉ đổi theo luật.
- **Chưa kiểm chứng bằng tay:** nhấp nháy 1 Hz và đèn xẹp/rách khi chơi thật, tiếng đèn tắt, lưu cài đặt mù màu, chơi hết một Đêm tới bình minh.

## Bằng chứng Phase 2 (`docs/proof/phase-2/`)

- `npm-test.txt`: 37/37 test đạt (Phần A: hồi quy Phase 1 với số chuẩn; Phần B: ít nhất một scenario headless cho mỗi tính năng mới).
- `browser-night{1,2,3}.json` + `night{1,2,3}.png`, `menu.png`: chạy bằng Chrome headless thật (`scripts/browser-check.mjs`), không có lỗi JS. **FPS đo trong môi trường render bằng CPU (SwiftShader, không GPU): trung bình khoảng 33–38 ở 1280×720 sau khi tự hạ độ phân giải; trên máy có GPU kỳ vọng cao hơn nhưng chưa đo.** Lần chạy đầu (trước khi có độ phân giải thích ứng) chỉ đạt ~20–25 FPS.
- **Chưa kiểm chứng:** âm thanh (chưa nghe), luồng menu đầy đủ bằng thao tác tay (chơi thắng tới màn Bình Minh), nhắc "E — Nạp ánh sáng", đồng hồ đỏ ≤ 30 s, độ nhạy chuột và lưu cài đặt. Các phần này chưa có test tự động.
- Chưa có video và Release.

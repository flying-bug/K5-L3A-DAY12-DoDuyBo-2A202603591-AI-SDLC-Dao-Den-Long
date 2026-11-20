# Đảo Đèn Lồng (Phase 2: ba hòn đảo)

> Video demo: _(chưa có — sẽ đặt link Release `v1.0.0` ở đây)_

Game 3D góc nhìn thứ ba. Mây, người giữ đèn đội nón lá, gom đom đóm, thắp lại các Đèn Lồng Lớn trên 3 hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông), né Bóng Mực và Gió Lạc. Logic nằm trong một lõi JS tất định (`src/sim.js`, 60 tick/giây); bản 3D (three.js) và chế độ headless dùng chung lõi này.

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 18 (macOS/Linux/Windows).

```bash
npm install            # build_cmd
npm start              # run_cmd: mở http://localhost:8080
npm test               # 37 test chạy CLI headless thật
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

## Luật chơi (số liệu chuẩn Ticket-02)

- Nhặt đom đóm (≤ 1 m), tối đa 10. Mỗi đèn cần 10, nạp nhiều lần được. Đèn sáng tạo vùng an toàn 6 m cho Bóng Mực.
- Bóng Mực chạm: −1 🔥, rơi nửa số đom đóm đang mang, bất tử 1.5 s. Rơi khỏi đảo: −1 🔥, mất hết đom đóm, hồi sinh sau 1 s.
- Gió Lạc (Đêm 2–3) cướp tối đa 3 đom đóm nếu bạn mang ≥ 5. Tỏa Sáng làm nó bỏ chạy và thả đồ. Bùa Gió: chạy 7.2 m/s, Lướt không hồi chiêu trong 10 s.
- Đêm 2: hai đảo nối bằng cầu tre không lan can, bục nhảy bắn qua đảo kia. Đêm 3: ba tầng, dốc, bục nhảy lên đỉnh, gió mạnh mỗi 30 s (có báo trước).
- Thắng Đêm khi thắp hết đèn; thua khi hết 🔥 hoặc hết giờ. Thắng Đêm 3 thì tới màn Bình Minh.
- **Điểm:** +10 mỗi đom đóm nạp, +100 mỗi đèn, +5 mỗi lần Tỏa Sáng trúng Bóng Mực; khi thắng +2 × giây còn lại, +50 × 🔥 còn lại. Tổng điểm = tổng các Đêm đã thắng.

## Chế độ headless (Test Contract v1.1)

```bash
node src/headless.js --seed 1 --night 1|2|3 [--scenario s.json] [--inputs i.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
```

Thoát 0 bình thường, 2 nếu inputs/scenario/tham số sai, 1 với lỗi khác. Số liệu trong `game.contract.json` khớp `src/config.js` (có test). Chạy đủ một Đêm (21.600 tick) mất khoảng 0.3 s (có test `< 30 s`). Ví dụ: `docs/proof/phase-2/sample-drifter-*`.

`fall_enabled` là `true` (rơi khỏi đảo bị phạt). Không có khái niệm nào trong contract bị bỏ trống.

## Tài liệu

- Spec + tiêu chí nghiệm thu từng tính năng Phase 2 và các giả định: [docs/notes/spec-phase2.md](docs/notes/spec-phase2.md) (Phase 1: [assumptions.md](docs/notes/assumptions.md))
- Nhật ký dùng AI, token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Harness AI: [AGENTS.md](AGENTS.md), `.claude/skills/verify-phase/`
- Đề lab gốc: `docs/lab-brief/`

## Sáng tạo của tôi

Chưa thêm tính năng ngoài ticket; ưu tiên số liệu chuẩn và Test Contract. Chi tiết nhỏ: nhân vật phụ Ông Đăng (lời giới thiệu mỗi Đêm), vầng sáng/vùng an toàn hiển thị quanh đèn sáng, Bóng Mực đổi màu khi bị choáng, nhạc nền và âm thanh tổng hợp bằng WebAudio (không file âm thanh, xem CREDITS).

## Bằng chứng Phase 2 (`docs/proof/phase-2/`)

- `npm-test.txt`: 37/37 test đạt (Phần A: hồi quy Phase 1 với số chuẩn; Phần B: ít nhất một scenario headless cho mỗi tính năng mới).
- `browser-night{1,2,3}.json` + `night{1,2,3}.png`, `menu.png`: chạy bằng Chrome headless thật (`scripts/browser-check.mjs`), không có lỗi JS. **FPS đo trong môi trường render bằng CPU (SwiftShader, không GPU): trung bình khoảng 33–38 ở 1280×720 sau khi tự hạ độ phân giải; trên máy có GPU kỳ vọng cao hơn nhưng chưa đo.** Lần chạy đầu (trước khi có độ phân giải thích ứng) chỉ đạt ~20–25 FPS.
- **Chưa kiểm chứng:** âm thanh (chưa nghe), luồng menu đầy đủ bằng thao tác tay (chơi thắng tới màn Bình Minh), nhắc "E — Nạp ánh sáng", đồng hồ đỏ ≤ 30 s, độ nhạy chuột và lưu cài đặt. Các phần này chưa có test tự động.
- Chưa có video và Release.

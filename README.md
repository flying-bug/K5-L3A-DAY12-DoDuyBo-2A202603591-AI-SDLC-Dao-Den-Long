# Đảo Đèn Lồng (Phase 1)

> Video demo: _(chưa có — sẽ đặt link Release `v1.0.0` ở đây)_

Game 3D góc nhìn thứ ba. Mây, người giữ đèn đội nón lá, gom đom đóm, thắp 5 Đèn Lồng Lớn trên Đảo Bến và né Bóng Mực trong sương đen. Logic game nằm trong một lõi thuần JS tất định (`src/sim.js`, 60 tick/giây). Bản 3D (three.js) và chế độ headless dùng chung lõi này.

## Cài đặt và chạy (3 lệnh)

Cần Node.js ≥ 18 (macOS/Linux/Windows).

```bash
npm install            # build_cmd
npm start              # run_cmd: mở http://localhost:8080
npm test               # chạy bộ test
```

## Điều khiển

| Phím | Hành động |
|---|---|
| WASD / mũi tên | Di chuyển (theo hướng camera) |
| Space | Nhảy |
| E | Đổ ánh sáng đã mang vào Đèn Lồng gần nhất (trong 3 m) |
| F | Tỏa sáng: choáng và đẩy lùi Bóng Mực (tốn 2 ánh sáng) |
| Kéo chuột / Q, R | Xoay camera |
| Enter | Chơi lại (sau khi thắng/thua) |

## Luật chơi

- Đi qua đom đóm (≤ 1.5 m) để nhặt, tối đa 10. Mỗi đèn cần 5 ánh sáng.
- Bóng Mực đuổi Mây. Chạm vào thì mất 1 🔥 (máu) và đánh rơi một nửa số đom đóm đang mang. Sau đó có 1.5 s bất tử.
- Đèn đã thắp tạo vùng an toàn bán kính 6 m mà Bóng Mực không vào được.
- Thắng khi thắp đủ 5 đèn. Thua khi hết 3 🔥 hoặc hết 300 s (trời sáng).
- **Điểm:** +10 mỗi đom đóm, +100 mỗi đèn thắp, +20 mỗi Bóng Mực bị choáng. Khi thắng: +1 mỗi giây còn lại, +50 mỗi 🔥 còn lại.

## Chế độ headless (Test Contract v1.0)

```bash
node src/headless.js --seed 1 --night 1 [--scenario s.json] [--inputs i.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
```

Thoát 0 khi bình thường, 2 nếu inputs/scenario/tham số sai, 1 với lỗi khác. Các số của game nằm trong `game.contract.json` và đã được test so khớp với `src/config.js`.

Ví dụ có sẵn: `docs/proof/phase-1/sample-*.json` → `sample-out.jsonl`.

## Các số tuning và giải thích

Mọi khái niệm trong contract đều có trong game: `fall_enabled=false` vì rìa đảo là bức tường (người chơi không rơi, không có sự kiện `fall`). Không có `dash`.

## Giả định (chỗ PRD-0 còn mơ hồ)

Xem chi tiết ở [docs/notes/assumptions.md](docs/notes/assumptions.md).

## Sáng tạo của tôi

Phase 1 chưa thêm phần sáng tạo ngoài lõi; ưu tiên lõi đúng và có bằng chứng. Hiệu ứng nhỏ có sẵn: đảo sáng dần khi thắp đèn, Bóng Mực đổi màu xanh khi bị choáng, đèn của Mây sáng hơn khi mang nhiều ánh sáng.

## Bằng chứng

- `docs/proof/phase-1/npm-test.txt`: kết quả `npm test` (12 test chạy CLI headless thật và kiểm tra output).
- `docs/proof/phase-1/sample-out.jsonl`: một lần chạy headless thật.
- **Chưa kiểm chứng:** giao diện 3D chưa được chạy thử trên trình duyệt trong lúc viết README này; chỉ mới kiểm tra server trả đúng file và cú pháp `web/main.js`.

## Harness AI và ghi chép

`AGENTS.md`, `docs/notes/` (giả định, nhật ký dùng AI). Đề lab gốc ở `docs/lab-brief/`.

# Changelog

## v1.0.0 — Phase 4 "Bình minh: phát hành" (Contract v1.3)

### Thêm mới
- **Benchmark** `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`: mở Chrome/Edge thật 1280×720 (không toàn màn hình, tắt vsync bằng `--disable-gpu-vsync --disable-frame-rate-limit`), cảnh chuẩn Đêm 1 với 200 Bóng Mực `wander` và 100 đom đóm (seed), L1–L3 sáng fuel 100; camera bay vòng R = 30 m, Y = 15 m, 15 s/vòng; 3 s khởi động rồi đo. Xuất `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb` (null, bản web), `vsync_off`, `renderer`, `os`.
- **Soak test** `node --max-semi-space-size=1 scripts/soak.mjs --seed 7 --nights 10 --out soak.json`: 10 Đêm xoay vòng trong một tiến trình, input ngẫu nhiên theo seed, đo RSS đầu/cuối.
- **Bảng xếp hạng cục bộ**: nhập tên sau màn Bình Minh hoặc khi thua (3–12 ký tự chữ/số/_, có hỗ trợ tiếng Việt có dấu), top 10, lưu trên đĩa (`data/leaderboard.json`) qua server cục bộ, màn Bảng xếp hạng từ menu, `node scripts/serve.js --export-leaderboard out.json`.
- **Dễ tiếp cận**: đổi phím mọi hành động (phát hiện trùng phím, khôi phục mặc định, có lưu); phụ đề/chỉ báo hình ảnh (Bóng Mực xuất hiện kèm mũi tên ở mép màn hình, gió sắp thổi, 10 s cuối, đèn có fuel < 30); "Giảm chuyển động" (tắt rung camera và chớp màn hình khi bị đánh); chữ UI tối thiểu 18 px và tùy chọn chữ lớn ×1.25.
- **Đóng gói**: `npm run release` tạo `release/dao-den-long-v1.0.0.tar.gz` chạy được chỉ với Node.js (đã kèm three.js); có `Dockerfile`.
- Ba màn mang bối cảnh Việt Nam (Làng quê Bắc Bộ, Phố cổ Hội An, Cố đô Huế) — chỉ thay diện mạo, luật và bản đồ giữ nguyên.

### Thay đổi
- `game.contract.json` lên `1.3`, thêm `bench_cmd`, `soak_cmd`. Mọi yêu cầu v1.0–v1.2 giữ nguyên.
- Phím tạm dừng mặc định là `Esc` (bỏ `P` để mỗi hành động có đúng một phím, đổi được). Phím mũi tên không còn là phím di chuyển phụ (có thể gán lại).
- Bóng Mực được vẽ bằng instancing (4 draw call cho mọi con) và shadow map chỉ cập nhật khi cần: benchmark từ ~64 FPS / p1-low 15 lên ~105 FPS / p1-low 36 trên GPU tích hợp.
- `Sim` có cờ `bench` (chỉ dùng cho cảnh benchmark): tắt sinh thực thể, sát thương, nhặt, tương tác, hao dầu và kết thúc Đêm. Không ảnh hưởng headless.

### Bổ sung sau tag `phase-4` (trước Release v1.0.0) — chỉ phần hiển thị trong `web/`, không đổi luật hay Contract
- Điều khiển cảm ứng cho điện thoại: joystick, nút Nhảy/Lướt/Thắp/Tỏa sáng, vuốt xoay camera, nút tạm dừng; HUD và menu co lại ở màn hình nhỏ.
- Màn hình chính mới với đoạn demo tự chơi làm nền (attract mode), nút kiểu game.
- Hướng dẫn chơi từng Đêm (trước mỗi Đêm, trong menu và khi tạm dừng).
- Mây có chân, dáng đi, khăn rằn, hiệu ứng lướt; Bóng Mực hiện hình sói mực. Bench đo lại: 104.3 / 34.9 FPS.
- CI: GitHub Actions chạy `npm test` và đăng bản web lên GitHub Pages.

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
- **Xóa** (có lý do): `win: all lit -> score…` và `win on the exact tick time runs out…` — kiểm tra thắng sớm khi đủ đèn, luật này đã bị thay thế. Thay bằng các test dawn ở Phần C.
- **Sửa số liệu**: `contract` (v1.2, thời lượng, khóa mới), `tick 0 snapshot` (240/270/300), `deposit` (+5/đom đóm, đèn đã sáng nhận châm dầu nên không còn "bị bỏ qua"), `shade states` (hết choáng → wander), `full Night 3 run` (đêm 3 dài 18.000 tick và dừng ở bình minh).
- Không có test nào bị `skip`. Thêm 22 test mới (Phần C).

## Phase 2 — "Ba hòn đảo" (Contract v1.1) — BREAKING

- **Số liệu chuẩn thay số tự chọn**: tốc độ 6, nhặt 1.0 m, tương tác 2.0 m, đèn cần 10, Tỏa Sáng 3 đom đóm / 5 m / 3 s, choáng 120 tick, đẩy 4 m trong 15 tick, Bóng Mực 4.0 m/s (Đêm 3: 4.5), bất tử 90 tick… Điểm: +10 mỗi đom đóm **nạp** (Phase 1 cộng khi **nhặt**), +5 mỗi lần trúng Tỏa Sáng (Phase 1: +20).
- **3 Đêm** với bản đồ chuẩn: Đêm 1 đảo tròn r 40; Đêm 2 hai đảo + cầu tre + bục nhảy; Đêm 3 ba tầng, dốc, bục nhảy, tháp.
- **Mới**: Lướt, rơi khỏi đảo (`fall_enabled: true`), Gió Lạc, Bùa Gió, gió mạnh Đêm 3, tạm dừng (`state: "paused"`), chuỗi 3 Đêm + menu + kết quả + Bình Minh, cài đặt âm lượng / độ nhạy chuột, âm thanh, HUD đầy đủ, bảng màu chuẩn.
- **Contract v1.1**: `--night 1|2|3`; snapshot thêm `night`, `wind`, `player.vel/grounded/invuln/dash_cd_s/pulse_cd_s/charm_s`, `motes`, `drifters`, `charms`; input `dash`, `pause`; sự kiện mới; tên trạng thái Bóng Mực `spawning/wander/chase/recoil/stunned`.
- Test Phase 1 được viết lại với số chuẩn (Phần A) và thêm test cho từng tính năng (Phần B).

## Phase 1 — PRD-0 (Contract v1.0)

- Lõi game tất định `src/sim.js` (60 tick/s), chế độ headless `src/headless.js` theo Test Contract v1.0, bản 3D three.js dùng chung lõi.
- Đêm 1 – Đảo Bến: đi lại, nhảy, camera 3D, đom đóm, thắp 5 Đèn Lồng Lớn, Bóng Mực, Tỏa Sáng, thắng/thua, điểm, HUD, chơi lại.
- 12 test chạy CLI headless thật.

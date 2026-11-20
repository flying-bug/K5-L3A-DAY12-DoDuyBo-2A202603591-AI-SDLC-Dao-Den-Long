# Spec Phase 4 (Ticket-04) — tiêu chí nghiệm thu và bằng chứng

| # | Mục | Tiêu chí | Bằng chứng |
|---|---|---|---|
| 1 | Benchmark | `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` mở cửa sổ 1280×720, tắt vsync bằng cờ trình duyệt, cảnh chuẩn (200 Bóng Mực `wander`, 100 đom đóm, L1–L3 sáng fuel 100, Mây đứng ở gốc, camera vòng R 30 / Y 15 / 15 s), 3 s khởi động, đo đúng `--duration`, thoát 0, đủ các trường. Ngưỡng: avg ≥ 60, p1-low ≥ 30, load ≤ 10 s | `bench.json` (gốc repo): 104.3 / 34.9 / 1951 ms trên Intel UHD Graphics (bản có mô hình sói; máy dao động: 4 lần xen kẽ được avg 103–131, p1-low 10–60). Test: `bench scene…`, `bench scene rules…`, `bench camera…`, `bench statistics…` |
| 2 | Soak | `node --max-semi-space-size=1 scripts/soak.mjs --seed 7 --nights 10 --out soak.json`; Đêm 1→2→3 xoay vòng, seed 7 + i (i từ 0), input ngẫu nhiên theo tỉ lệ ticket; `crashes = 0`, `mem_end ≤ 1.2 × mem_start` | `soak.json` (gốc repo): 0 crash, 52 → 50 MB (Windows); Linux Node 22: 57 → 57, Node 24: 70 → 70. Test: `soak: …` (đạt cả trên GitHub Actions/Linux) |
| 3 | Bảng xếp hạng | Nhập tên sau Bình Minh hoặc khi thua; tên 3–12 `[A-Za-z0-9_]` (+ chữ tiếng Việt có dấu); mục gồm `name, score, nights_won, achieved_at (ISO 8601 có múi giờ), seed`; top 10; điểm giảm dần, bằng điểm thì ai đạt trước đứng trên; lưu trên đĩa; màn Bảng xếp hạng từ menu; `node scripts/serve.js --export-leaderboard out.json` | 8 test (luật, file trên đĩa, API, khởi động lại server, export); ảnh `docs/proof/phase-4/ui-leaderboard.png` |
| 4a | Đổi phím | Mọi hành động (4 hướng, nhảy, lướt, tương tác, tỏa sáng, tạm dừng, xoay camera); báo trùng phím; "Khôi phục mặc định"; lưu | 2 test (`keys: …`); ảnh `ui-keys-conflict.png` |
| 4b | Phụ đề / chỉ báo | Bóng Mực xuất hiện (+ mũi tên mép màn hình), gió sắp thổi, 10 s cuối, đèn fuel < 30 | ảnh `ui-captions.png` (đèn sắp hết dầu). **Chưa chụp được** phụ đề Bóng Mực/gió/10 s cuối trong ảnh; logic có nhưng chưa kiểm chứng bằng mắt |
| 4c | Giảm chuyển động | Tắt rung camera và chớp màn hình | Cài đặt có; **chưa kiểm chứng bằng mắt** khi bị đánh |
| 4d | Cỡ chữ | Chữ UI ≥ 18 px ở 1280×720; tùy chọn ×1.25 | `web/style.css` (mọi `font-size` ≥ 18 px, nhân `--u`); ảnh `ui-settings.png` |
| 5 | Đóng gói | Clone sạch → tối đa 3 lệnh → chơi; README đủ mục; CHANGELOG 4 phase; CREDITS; LICENSE; Release có bản chạy được | `npm run release` → `release/dao-den-long-v1.0.0.tar.gz` (đã giải nén và chạy thử); `Dockerfile` |
| 6 | Contract v1.3 | `contract_version 1.3`, `bench_cmd`, `soak_cmd`, giữ mọi yêu cầu cũ | test `contract v1.3…`; 58 test cũ vẫn đạt |
| 7 | Retro & demo | Retro 1–2 trang; video < 5 phút | `docs/retro.md`. Video `docs/demo/demo.mp4` (4 phút, quay tự động bằng script; phần chơi do bot điều khiển, ghi rõ trong video) — làm sau mốc 4 giờ. Ghi chú cũ: video chưa có lúc tag (máy làm bài không có ffmpeg/công cụ quay; cần quay tay) |

## Giả định

- `peak_mem_mb = null` vì là bản web: trang không đọc được RSS của tiến trình trình duyệt. Thêm `js_heap_peak_mb` (heap JS của trang) để tham khảo.
- `vsync_off` = cờ tắt vsync đã truyền **và** quan sát được > 5% khung hình ngắn hơn 15 ms.
- `load_ms` tính từ lúc tiến trình `bench.mjs` bắt đầu (gồm khởi động server và trình duyệt) tới khung hình đầu tiên của cảnh bench.
- Camera "ngược chiều kim đồng hồ" dùng cùng quy ước góc với bản đồ của ticket (góc tăng từ +X về +Z), xuất phát (30, 15, 0).
- Cảnh bench tắt các phần sáng tạo động (động vật, hạc, đèn trời, hạt bay) nhưng giữ cảnh tĩnh, ánh sáng và bóng đổ như lúc chơi.
- Soak: "Đêm thứ i" đánh số từ 0 nên Đêm đầu dùng đúng `--seed`. "Tải xong" = V8 đã biên dịch mã của cả ba bản đồ (chạy thử một Đêm bỏ đi cho mỗi loại Đêm 1/2/3, seed không trùng seed soak) và Đêm đầu đã dựng xong. Lý do: trên Linux, lần đầu gặp Đêm 2 và 3, RSS tăng một lần ~12 MB (JIT/heap) rồi đi ngang từ Đêm 6 tới Đêm 100, nên không phải rò rỉ; nếu chỉ chạy thử Đêm 1, phần tăng một lần này làm test trượt trên GitHub Actions. `--max-semi-space-size=1` giới hạn vùng nhớ tạm của V8.
- Bảng xếp hạng ghi qua server cục bộ (`scripts/serve.js`) vào `data/leaderboard.json` (đổi thư mục bằng `DDL_DATA_DIR`); nếu mở game không qua server thì lưu tạm trong trình duyệt.

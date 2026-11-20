# Nhật ký dùng AI

Công cụ: Claude Code (Sonnet 5.5) trong VS Code.

## Phase 1

- Prompt chính: dán nguyên PRD-0 + Test Contract v1.0 và yêu cầu làm Phase 1.
- Quyết định: tách lõi `src/sim.js` (không phụ thuộc DOM/GPU) dùng chung cho headless và bản 3D, để bằng chứng headless phản ánh đúng game thật. Chọn JS vì Node có sẵn trên mọi máy, không cần build.
- Test viết sau lõi và chạy CLI thật (spawn tiến trình), không import hàm nội bộ.
- Lỗi AI/đo được: lần chạy test đầu có 1 test fail; nguyên nhân là lỗi trong test (đom đóm đặt ngoài bán kính nhặt), không phải lỗi game. Đã sửa test, không nới điều kiện.
- Heredoc dài trong Bash bị lỗi quote nên chuyển sang tạo file bằng công cụ Write.
- Token/chi phí: chưa có số đo chính xác trong phiên này; ước tính khoảng 40–60k token cho Phase 1 (ghi là ước tính, không phải số đo).
- Chưa làm: kiểm chứng bản 3D trên trình duyệt thật, video, Release.

## Phase 2 (Ticket-02)

- Prompt chính: dán nguyên TICKET-02. Quyết định: viết lại `Sim` theo đúng thứ tự tick bắt buộc, tách bản đồ sang `src/levels.js`, thêm `docs/notes/spec-phase2.md` (AC cho mỗi mục Phần 3) trước khi sửa test.
- Test: viết lại `tests/headless.test.js` thành Phần A (hồi quy Phase 1 với số chuẩn, test cũ được chỉnh số: bán kính nhặt 1.0, đèn cần 10, +10 điểm khi nạp thay vì khi nhặt, Tỏa Sáng 3 đom đóm...) và Phần B (tính năng mới). 37 test.
- Lỗi do AI/đo được: lần chạy đầu 5/37 fail. Cả 5 là lỗi trong test, không phải game: đỉnh bục nhảy ~4.8 m chứ không > 5; Bóng Mực đặt xa hơn 18 m tự về `wander`; thử Tỏa Sáng bị Bóng Mực thứ hai lấy mất đom đóm; kiểm tra bất tử đúng lúc bị đánh lại; đêm 3 với 99 Lửa vẫn thua sau 12k tick. Đã sửa test (không nới điều kiện).
- Bản 3D lần đầu chỉ ~20-25 FPS khi render bằng CPU; tắt antialias và thêm hạ độ phân giải tự động → ~33-38 FPS (cùng môi trường).
- Token/chi phí: chưa có số đo; ước tính 150-200k token cho Phase 2 (ước tính, không phải số đo).
- Chưa làm: nghe thử âm thanh, chơi tay qua cả ba Đêm, video, Release.

## Phase 3 (Ticket-03, Change Request)

- Prompt chính: dán nguyên TICKET-03. Quyết định: viết ADR + CHANGELOG + spec-phase3 (AC từng mục) trước, rồi sửa `Sim`, rồi test, rồi giao diện.
- Cách làm luật đổi: lưu dầu bằng số nguyên 1/60 (đúng gợi ý ticket); thêm `_fuelStep()` sau bước 2; viết lại `_interact`, `_moveShades`, điều kiện thắng/thua; vá `sim.js` bằng script Python có `assert` số lần khớp để không sửa nhầm chỗ.
- Test: chạy bộ test cũ trước khi sửa test để thấy chính xác 7 test bị luật mới làm sai (contract, tick 0, deposit, 2 test thắng sớm, shade states, perf Đêm 3), sau đó sửa/xóa kèm lý do, rồi thêm 22 test mới. Cuối cùng 58/58.
- Phát hiện khi viết test (không phải lỗi của AI hay của ticket): do hao dầu chạy trước tương tác, đèn "đầy đúng 100" không tồn tại lúc bấm E, nhánh `used = 0` gần như không thể xảy ra. Ghi vào ADR, giữ nguyên thứ tự theo ticket.
- Lỗi do chính mình viết sai kỳ vọng ở 4 test mới (khoảng cách Mây-Bóng Mực 7 m thay vì < 6 m, ngưỡng tick đến đèn, cho rằng đèn 100 là đầy). Đã sửa test cho khớp luật, không nới điều kiện.
- Token/chi phí: chưa có số đo; ước tính 120-170k token cho Phase 3 (ước tính, không phải số đo).
- Chưa làm: chơi tay hết một Đêm theo luật mới, video, Release.

## Phase 4 (Ticket-04, phát hành)

- Prompt chính: dán nguyên TICKET-04. Thứ tự làm: lõi dùng chung (`src/leaderboard.js`, `src/keybinds.js`, `src/bench.js`, cờ `bench` trong `Sim`) → script (`serve.js` + API/export, `soak.mjs`, `bench.mjs`, `make-release.mjs`) → giao diện → test → tài liệu.
- Đo rồi mới tối ưu: bench lần đầu trên Intel UHD 63.7 FPS / p1-low 14.9 (không đạt). Thêm số đo chẩn đoán (CPU sim, CPU render, draw call) → thủ phạm là `renderer.render` với ~800 draw call của 200 Bóng Mực. Chuyển sang InstancedMesh và chỉ cập nhật shadow map khi cần → 105.6 / 36.5.
- Soak: lần đầu RSS 45 → 55 MB (vượt 1.2×). Chạy 100 Đêm thấy RSS đi ngang ~58 MB → là JIT/heap của V8, không phải rò rỉ. Đo sau gc, coi 1 giây chạy thử là phần "tải xong Đêm đầu", và giới hạn vùng nhớ tạm của V8 trong `soak_cmd` → 47 → 51 MB, ổn định qua nhiều lần chạy.
- CI (GitHub Actions, Linux Node 22): test soak trượt (48 → 61 MB). Tái hiện bằng Docker `node:22-slim`; 100 Đêm vẫn 61 MB nên là phần tăng một lần khi gặp Đêm 2/3 lần đầu, không phải rò rỉ. Sửa: chạy thử một Đêm bỏ đi cho mỗi loại Đêm trước khi đo `mem_start`. Sau sửa: Linux Node 22 57 → 57, Node 24 70 → 70 (100 Đêm: 69 → 72), Windows 52 → 50; 75/75 test trên Windows và trên Linux Node 22.
- Lỗi môi trường: `tar` của Git Bash hiểu `E:` là máy từ xa → dùng đường dẫn tương đối.
- 17 test mới (75 tổng), đạt ngay lần đầu.
- Token/chi phí: ước tính 150-200k token (ước tính, không phải số đo).
- Chưa làm: video demo (không có công cụ quay trên máy làm bài).

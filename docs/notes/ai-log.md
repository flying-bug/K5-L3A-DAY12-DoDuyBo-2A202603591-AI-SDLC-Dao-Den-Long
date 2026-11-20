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

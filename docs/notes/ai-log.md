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

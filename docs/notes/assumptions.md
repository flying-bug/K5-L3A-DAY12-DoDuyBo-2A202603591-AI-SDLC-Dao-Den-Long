# Giả định Phase 1

| Chỗ mơ hồ | Giả định |
|---|---|
| Thắp đèn bằng cách nào | "Nạp ánh sáng": mang đom đóm, nhấn interact trong 3 m để đổ vào đèn gần nhất chưa thắp. Đèn cần 5; đổ dư thì giữ lại phần thừa. Đèn đủ 5 là sáng. |
| "Máu" | Là `flames` (3). Mỗi lần chạm mất 1. |
| Tỏa sáng | Tốn 2 đom đóm mang theo (không đủ thì không phát), hồi 1 s, choáng 3 s các Bóng Mực trong 8 m và đẩy lùi 3 m. Chỉ Bóng Mực mới bị choáng lần đầu mới tính điểm. |
| Vùng an toàn | Chỉ đèn **đã thắp** có vùng 6 m. Bóng Mực bị đẩy ra rìa vòng, nên đứng trong vòng là an toàn. |
| Rơi đom đóm | `floor(carried × 0.5)` rơi thành vòng quanh người chơi bán kính 2.5 m (có thể nhặt lại). |
| Rìa đảo | Bán kính 40 m, là tường. Không có rơi. |
| Bố cục đèn | 5 đèn trên vòng bán kính 25 m, L1 tại (0,0,25), cách đều 72°. |
| Sinh ngẫu nhiên | 24 đom đóm lúc đầu, hồi 1 con mỗi 4 s khi thiếu. Bóng Mực đầu tiên ở giây 5, rồi mỗi 12 s, tối đa 5, sinh ở rìa đảo. |
| Hết thời gian | `time_left_s` về 0 → thua `dawn`. |
| Điểm thắng | Thưởng thời gian dùng phần nguyên của giây còn lại. |
| Phím nhấn | Hành động kích hoạt khi chuyển false→true; nhấn trong khi đã ở trạng thái true lúc bắt đầu thì không kích hoạt lại. |
| Scenario đèn `lit:true` | Đặt `deposited` ≥ 5, không điểm, không sự kiện. Id đèn không có trong màn bị bỏ qua. |
| Lúc thua | Nếu hết máu thì kết thúc ngay trong tick đó. Nếu cùng tick đèn cuối sáng thì thắng được xét trước. |

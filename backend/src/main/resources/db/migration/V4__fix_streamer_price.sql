-- 초기 시드가 100원으로 잘못 설정된 스트리머 가격을 1000원으로 수정
UPDATE streamers SET price = 1000.00 WHERE price = 100.00;

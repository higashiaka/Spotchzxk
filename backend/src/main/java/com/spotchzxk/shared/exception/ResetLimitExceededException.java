package com.spotchzxk.shared.exception;

public class ResetLimitExceededException extends RuntimeException {
    public ResetLimitExceededException() {
        super("오늘 최대 초기화 횟수(3회)를 모두 사용했습니다. KST 자정 이후 다시 시도해주세요.");
    }
}

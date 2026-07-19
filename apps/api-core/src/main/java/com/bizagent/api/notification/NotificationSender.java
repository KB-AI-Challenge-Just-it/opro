package com.bizagent.api.notification;

/**
 * 인앱 알림(원본)을 외부 채널로 미러 발송하는 어댑터 경계.
 * 채널 교체(카카오 → KB push/알림톡)를 구현 교체만으로 가능하게 하기 위한 인터페이스 (ADR 001 §5-6).
 * 계약: 구현체는 실패를 삼키고 예외를 호출부(파이프라인)로 전파하지 않는다.
 */
public interface NotificationSender {

    /**
     * @param profileId      수신 대상 프로필
     * @param notificationId 원본 notification 레코드 id (발송 이력 FK)
     * @param reportId       알림이 가리키는 리포트 id (딥링크 대상)
     * @param title          알림 제목 (외부 채널 본문으로 사용)
     */
    void send(long profileId, long notificationId, long reportId, String title);
}
